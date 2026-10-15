# Plan: open job servers, coder sessions, finished codings, cleanup

Status: discussion summary and work plan (2026-10-15). Built parts are
struck through or marked done. Complements `docs/architecture.md` and `docs/coder-identity.md`; once a
part is built, fold it into those docs and delete it here.

## 0. Where things stand

- **Update:** these changes were committed (`e2bc539`). §9 below revises
  §4's model. What follows describes those changes:
  - `GET /backend/.../codings?variables=...`: finished codings only, with
    only the agreement variables' values.
  - `GET /backend/.../annotations?coderId=X`: one coder's annotations
    (the "workspace"), loaded lazily and evicted when idle.
  - A `done` flag on annotation writes, `doneAt` on the db server (set once),
    a one-off backfill in the mock server.
  - A codebook redeploy no longer re-downloads annotations.
  - Tests for all of it; all tests pass.

  §4 below changes the model (row exists = finished, keyed by loop), so the
  `done` flag and backfill go away again. The workspace split and the
  "redeploy keeps codings" part stay. Decide: commit as WIP and rework, or
  discard and redo as part of §4.
- `loadCodings` in `runtime.ts` loads *which coder finished which unit*
  (the core of distribution); the agreement values only ride along. Rename
  to e.g. `loadFinishedCodings`.

## 1. Trust between job server and db server

### Target

- The invite link goes to the job server, on the same origin as the client:
  `annotinder.com/invitation/<token>`.
- The token holds the **db server URL** and an **invite secret** that only
  the db server can interpret (JWT or a long random id).
- The job server sends the invite secret to the db server, with a request
  **signed with the job server's private key**. The db server:
  - checks that it made this invite for this job server URL;
  - fetches the job server's public key from that URL
    (`/.well-known/jwks.json`) and verifies the signature;
  - returns a **job token**: a bearer token for this job only, with an
    expiry, renewable through the same signed handshake.
- With the job token the job server reads the job and writes annotations.

Today instead: the job server has a fixed list of db servers
(`ANNOTINDER_BACKENDS`) with one **shared secret per db server**, for all
its jobs, configured on both sides. Deployment ids are
`<backend name>.<jobId>`.

### Abuse risk of a public job server

If anyone can use a job server, then anyone who crafts an invite link makes
the job server fetch a URL of their choice. Risks:

1. **SSRF**: fetching internal addresses (cloud metadata, the host's own
   network).
2. **Amplification**: using the job server to hammer a third-party host.
3. **Phishing / bad content** under the job server's domain: a malicious db
   server serves units and codebooks to coders at `annotinder.com`.
4. **Resource use**: huge jobs on someone else's job server.

Mitigations:

- **Registration first (answers "would it help if the db server first calls
  the job server?": yes).** The db server registers a job with the job
  server (`POST /register { dbServerUrl, jobId }`), and the job server
  verifies it, ACME-style: it fetches a challenge from the db server's URL,
  or the db server proves control with a signature. Only registered
  `(db server, job)` pairs get outbound fetches. The gain: an *anonymous
  visitor clicking a link* can no longer trigger fetches to arbitrary URLs.
  Only registration does, and registration can be rate-limited, require an
  account or API key on a public job server, and run the checks once.
  Registration is also where the first job token is issued.
- **Outbound fetch hygiene** (for registration and everything after):
  https only, port 443, resolve DNS and refuse private / loopback /
  link-local / metadata ranges, no redirects (or re-check each hop),
  timeouts and response size limits. On Cloudflare Workers, private-network
  SSRF is mostly moot, but keep the rules for the Node target.
- **Rate limits and quotas per db server** (requests, units, coders).
- **Show where a job comes from**: "This job is hosted by amcat.com" in the
  coder UI. Rendering of unit content must stay sanitized (it already is a
  concern regardless of federation).
- A self-hosted job server can keep a plain allowlist and skip
  registration.

Registration does not stop someone running their own malicious db server;
on an open service that is fine. 3 and 4 are handled by quotas, the
origin label, and the ability to block db servers.

### Returning coders after the job server forgot the job

A returning coder has a session cookie, not the invite. If the job server
has forgotten the job, it needs the db URL and a job token again. Options:

- the deployment id (in the URL and cookie) encodes the db server URL, and
  the signed handshake alone (without invite secret) yields a new job token
  for a registered job; or
- the client keeps the invite token and resends it when the job server
  asks.

The first is cleaner (invite secrets don't need to live on the device).

### Db server -> job server calls

Use the **job token** as the bearer for `refresh`, `status` and `drop`;
nothing hard about it. Notes:

- If the job server has forgotten the job it has no token to compare with,
  but then there is nothing to refresh or drop either: answer 404 and load
  fresh on the next coder visit.
- `refresh` could even be unauthenticated (it only triggers a re-fetch over
  the authenticated channel), but `status` leaks progress and `drop` should
  not be callable by anyone, so just use the token everywhere.
- Store a hash of the job token on the job server, not the token.

## 2. Coder sessions

> Revised by §9.2: the db server keeps a coders table with coder keys; the
> job server creates the keys and keeps them in an httpOnly cookie.
>
> **Built (2026-10-15)**, per §9.2's leaning: a random session key per job
> session in an httpOnly cookie per deployment (`Path=/d/<deployment>`),
> named by invite + participant id; the db server stores its SHA-256 as the
> coder key. CSRF: required `x-annotinder` header, no CORS. Transfer links
> set the cookie on the new device. Dev: Vite proxies `/d/`. Details in
> `coder-identity.md` §4. Not built: a device id, signed sessions (not
> needed while the db server keeps keys), and the open decision below.

### What the coder key is today

Both things at once: it lets a reload continue the session, **and** it is
the only credential for that session's annotations, which makes it
effectively a device id (except that a transfer link copies it). The client
generates it, keeps it in `localStorage` (scoped by job server + deployment
+ invite + participant id), sends it as `x-coder-key`, and the db server
stores it to map it to a `coderId`. In `localStorage` it can be stolen by
XSS.

### Target

- An **httpOnly, Secure, SameSite=Lax cookie** set by the job server (same
  origin as the client), containing a session **signed (or encrypted) by the
  job server**: `{ deployment, coderId, exp }`.
- Then the db server no longer needs to store coder keys at all: the job
  server already has full access to the job, so it is trusted to say which
  coder a request is for. Keep old signing keys around for verification
  during key rotation, or every anonymous session is lost on rotation.
- CSRF: SameSite=Lax plus a required custom header on all writes.
- One cookie per deployment (`Path=/d/<deployment>`), so several jobs can run
  side by side in one browser.

### Cases

| Situation | What happens |
| --- | --- |
| Reload / revisit on the same device | Cookie present: continue. |
| Coder closed the job, or another session took its place | Needs the invitation again (below). |
| Anonymous invite opened again | New session by default. See the open decision below. |
| Authenticated invite opened again | Log in again: the same identity continues the same coder, on any device. |
| Invite with a participant id opened again on another device | No access to that participant's annotations without the device's session (the participant id is a label, not a credential). As now: 409 `participant_has_session`, offer "continue on the original device / transfer link" or "start a new session". |
| Transfer link | Redeeming it sets the session cookie on the new device. |

**Open decision: reopening an anonymous invite on the same device.**
Starting fresh is the safe default for shared (lab) computers, but loses
work after an accidental close. Option: remember earlier sessions on the
device and offer "continue previous session / start new". The idea of a
session list in `localStorage` encrypted with a key from an httpOnly cookie
works, but is more than needed: the list can live in the httpOnly cookie
itself (a few signed `coderId`s fit in 4 KB), or in one cookie per session.
Possibly a per-invite setting ("shared devices: never resume").

## 3. Authentication

Mostly as in `docs/coder-identity.md` §5, with these refinements:

- The job server runs the OAuth / OIDC flow: the db server's own login
  (db server as OAuth provider), or Google / Microsoft / ORCID /
  SURFconext, or an email code (only for invites with an `emails`
  allowlist).
- After login the job server sets its **own** signed session cookie (§2).
- **Store the provider's refresh token only if the job server must call
  the db server on the coder's behalf** (delegated access). If login only
  proves who the coder is, the job server's own session is enough, and
  keeping third-party refresh tokens (even encrypted in a cookie) adds risk
  for nothing. Open: do we foresee delegated calls?
- If the db server is the OAuth provider, it can also be the authority for
  the job token (§1): one trust mechanism instead of two.

## 4. Finished codings: what the job server loads

> **Built (2026-10-16)**, as revised by §9.3/§9.4: per-variable rows with
> `retiredAt`, "finished" = all of the loop's current questions live, codings
> per loop, global load for dynamic loops only, lazy workspaces, status on
> demand, reset endpoint, deploy warning. Now described in
> `architecture.md` §3 and §8.2; the text below is history.

### The problem with the current plan

`GET /codings` still lists **every** finished (coder, unit) pair, only
without most values. That cuts bytes per row, not the number of rows.

### What the job server actually needs

| Needed for | Global (all coders) or per coder | Data |
| --- | --- | --- |
| A coder's progress, next unit in a fixed source, `maxUnits` | per coder | the coder's own finished units, in order: comes with the workspace |
| Dynamic sources: open slots, completeness, priority | global, but only for units in dynamic sources | per unit: number of codings, plus the agreement variable's values |
| Researcher status (`completeUnits` etc.) | global | counts; rare, can be fetched or aggregated on demand instead of held in memory |
| `balanced` auto variables | global | count of coders per value (from coders, not codings) |

So for **fixed** sources nothing global is needed for distribution at all.
For **dynamic** sources the global data is bounded by
`units x maxCoders` (maxCoders is required with an agreement rule), which
is fine. The cold-start load becomes: spec + codings of **dynamic loops
only**. Without an agreement rule the db server can even aggregate:
`unitId -> count`. With one, it returns the raw values of that one
variable, and the job server canonicalizes them (`agreementKey`), so the db
server still runs no codebook logic.

### "Row exists = finished", keyed by loop

- Key annotations by **unitId x loop x coderId** (today: unitId x coderId).
  That also fixes the open point that a unit in two loops shares one
  annotation (architecture.md §8.2).
- The job server writes a unit's annotation **only when the coder finished
  the unit** in that loop. Then the row's existence means finished, and
  there is no `done` flag to store or infer.
  - Finding: this is already nearly true. The client posts unit variables
    only after the last step of a unit, with `done: true` on every variable
    (`JobManager.advanceUnit`). Partial annotations only appear in theory.
  - The job server rejects (or ignores) partial submissions.
  - Per-variable `done` can then go from stored values; `skip` stays (a
    question that didn't apply).
  - "Every variable exists" is not a usable rule: with conditions, not every
    question is asked. "At least one variable exists" works only because of
    the rule above, so the rule above is the actual definition.
- **Order**: the row's `created` timestamp, set on insert and never changed
  (replaces `doneAt`). Editing a finished unit updates `updated`, not
  `created`.
- Mid-unit progress after a reload is then client-side only (or dropped),
  which is acceptable.

### Endpoints (sketch)

- `GET /backend/job/:jobId/codings?loop=<name>&variables=a,b`: finished
  codings of one (dynamic) loop: `{ unitId, coderId, created, values? }`.
- `GET /backend/job/:jobId/annotations?coderId=X`: a coder's annotations,
  all loops: the workspace, including their finished set and order.
- `PUT /backend/job/:jobId/annotations/:loop/:unitId/:coderId`: write
  (only complete units).
- Status: either computed by the job server on demand from the above, or a
  small aggregate endpoint. Decide when building.
- Pagination (`?after=<cursor>`) for `codings`.

## 5. Mock server

It has grown to ~2000 lines and serves three purposes: the researcher API
for the client's admin side, the backend API, legacy coder routes
(`routes/session.ts`, used by the admin preview) plus dev auth. It no
longer reads as "what a db server must implement". Plan:

- ~~**Reference db server**~~ Done: `packages/reference-db-server`, only the
  backend API, in memory, from the conformance fixture (~230 lines).
- ~~**Conformance test suite**~~ Done: `packages/conformance`. Fixture
  (`ConformanceFixtureSchema`, plain JSON) plus a vitest suite over HTTP;
  `pnpm conformance` runs it against `DB_SERVER_URL`. Covers auth,
  deployment, units, coder resolve (invites, maxUses, participants,
  `auth_required`), annotation upserts and `/finished` counting. Both the
  reference and the mock server run it in their tests.
- ~~**Dev server**~~ Kept as `packages/mock-server`: the researcher API plus
  its own backend API, so `pnpm dev` works; no longer the reference.
- ~~Remove the legacy coder routes~~ Done: the admin preview runs on the job
  server (`<backend>.<jobId>.preview`, in memory), and the mock server's
  `routes/session.ts` is gone. The `doneUnitIds` column stays for now: the
  researcher coder listing (`GET /coders`, `unitsDone`) still reads it. To
  replace: progress per loop from the job server's status, or from
  `POST /finished` on the db server.

## 6. Cleanup

- ~~**Delete `old/`**~~ Done (recoverable with `git checkout e2bc539 -- old`).
  Nothing was left to port. Two deferred items had used it as a visual
  reference: a UX parity pass, and a live codebook preview. Ideas from its
  notes worth keeping:
  - **Rate and resource limits:** rate limits per user; resource limits
    (jobs, units, coders) per server account, which can hand out quota per
    project, e.g. "every student in a course may create x jobs". Relevant
    to §1's quotas.
  - **Client-side unit cache:** keep a job's units in IndexedDB, check
    against `GET /units` ids and hashes, and fetch only what changed.
    Relevant for the admin side with large jobs.
- ~~**`annotinder-client_design_plan.txt`**~~ Done. Still-valid client
  decisions moved to `docs/client.md`; the code's "design plan §x" comments
  now point to `docs/client.md`, `architecture.md`, `coder-identity.md` or
  `CONTRACTS.md`. The dead positional-codebook helpers
  (`contracts/src/codebook/position.ts`) were removed, and CONTRACTS.md
  describes the codebook as a tree.
- **`TODO.txt`**: UI/feature notes, not a plan. Keep, or move to issues.
- ~~Remaining `TODO(phase N)` comments~~ Done: stale "Phase N" references
  removed. Four plain `TODO`s remain, worth turning into issues:
  backend `annotations`/`codings` pagination; a swipe-card UI for the
  `annotinder` answer type; a discriminated-union `VariableValue` (with the
  nominal/ordinal/numeric answer types from `TODO.txt`); a live codebook
  item preview.
- **This document**: fold the built parts into `architecture.md` /
  `coder-identity.md` as they land, then delete it.
- `docs/architecture.md` §10 (open questions): update to match.

## 7. Order of work

1. **Cleanup** (§6). Independent, low risk, makes the rest easier to read.
2. ~~**Codings model** (§4)~~ Done, per §9.3/§9.4.
3. ~~**Mock server split + conformance suite** (§5)~~ Done, except removing
   the legacy coder routes (waits on the admin preview).
4. ~~**Sessions in httpOnly cookies** (§2)~~ Done; the db server keeps
   storing (hashed) coder keys, per §9.2.
5. ~~**Coder-level annotations loaded lazily** (§11)~~ Done.
6. ~~**Timed outbox to the db server** (§10)~~ Done on Node; the Durable
   Object store comes with the Cloudflare target.
7. **Trust handshake** (§1): invite token, registration, signed handshake,
   job tokens, outbound fetch hygiene, quotas.
8. **Authentication** (§3).

## 8. Open decisions

- ~~Uncommitted changes: commit as WIP, or discard (§0).~~ Committed.
- Per-job keys vs. a derived device id (§9.2).
- ~~Which variables define "finished" after a codebook update (§9.3).~~
  First version: all current ones, with a warning on deploy.
- Reopening anonymous invites on the same device (§2).
- Delegated access, i.e. whether to keep provider refresh tokens (§3).
- Returning coders after the job server forgot the job: deployment id
  encodes the db URL, or the client keeps the invite token (§1).
- Registration on public job servers: open, rate-limited, or account/API
  key (§1).
- Status: computed on demand or db-side aggregates (§4).
- Outbox flush interval and limits: max pending writes and max age before
  the job server stops accepting work (§10).
- Writes that arrive with an old `codebookId` after a reset: store as-is
  (current lean), or reject (§10).
- Renaming `POST /finished` once it also serves coder-level groups (§11).
- Codebook content hash on the codebook record (§12).
- Unit hash over the job server's extracted fields instead of the db
  server's full `data`, once unit preprocessing is designed (§12).

## 9. Review notes (2026-10-15)

Kasper's comments on §2 and §4, with Claude's thoughts. Decisions marked
**Decided**; the rest is to discuss when we pick this up.

### 9.1 Same origin

**Decided:** client and job server always share an origin. So httpOnly
session cookies work, and embedding in another origin is not a goal.

### 9.2 Coder keys: who makes them, and linking across jobs

**Decided:** the db server keeps a coders table relating a job to coder
keys, and optionally a participant id and email. It also holds the coder's
annotations, stored however the db server finds efficient. What changes is
that the **job server** creates the key, and the key lives in an
**httpOnly cookie** (encrypted or signed by the job server), not in
`localStorage`.

**Question: one device id for all jobs, with the per-job coder key derived
from it?** E.g. `coderKey = H(deviceId, jobId)`.

- **Linking.** A hash already prevents linking: two db servers see
  unrelated keys, and can't connect them without knowing `deviceId`, which
  never leaves the job server and the httpOnly cookie. Use a keyed hash,
  `HMAC(derivationKey, deviceId || deploymentId)`, not a plain hash. Then a
  leaked `deviceId` alone isn't enough to compute anyone's coder keys. The
  derivation key must be long-lived: rotating it changes every key, which
  loses every anonymous session.
- **Where derivation gets awkward:**
  - **New session on the same device** (participant link, or an anonymous
    invite opened again). This needs a second key for the same device and
    job, so the derivation needs an extra input, such as a session counter
    or an invite id.
  - **Transfer link.** The new device has a different `deviceId`, so its
    derived key differs. Either the db server lets a coder have several
    keys (a `coder_keys` table: redeeming a transfer adds the new device's
    key to the same coder), or the new device stores the transferred key
    in a per-job cookie, which makes it not derived.
- **Simpler alternative with the same privacy:** one random coder key per
  job session, made by the job server and kept in a per-deployment httpOnly
  cookie (`Path=/d/<deployment>`). Keys are independent, so there is
  nothing to link. A transfer copies one job's key into the other device's
  cookie. A new session simply gets a new key. This is today's model, with
  the key moved from `localStorage` into a cookie the job server controls.
  In both variants the db server can store a **hash** of the key instead of
  the key.
- **What a device id adds:** "remember sessions on this device" across jobs
  (§2 open decision), and one cookie instead of one per job. If we want
  that, the cookie can hold a small list of per-job keys instead.

**Leaning:** per-job random keys in per-deployment cookies, and a
`coder_keys` table if a coder can be used from more than one device.
Naming: since the key is per job and not per device, "coder key" (or
"session key") fits better than "device id".

### 9.3 Finished = computed from the current codebook's variables

**Decided (2026-10-15):**

- No `done` flag and no `loop` field on annotations.
- A unit is finished for a coder when **all** of the loop's variables in the
  current codebook have a live value. Questions a condition skipped get
  `skip: true`.
- The job server sends the variable list per loop, and the db server
  counts.
- Resetting = retiring rows (§9.4), not clearing a field.
- First version: count all current variables of the loop. When a deploy
  adds questions to a loop that has finished units, warn the researcher
  that those units will reopen.

Why not `loop: [id]` instead of `done`: it makes the loop name an identity
(renaming orphans finished units); it isn't needed to tell loops apart,
because variable names are unique in a codebook; and resetting by clearing
it creates duplicate `loop: null` rows.

**Proposal (Kasper):** when loading a coder's finished units, the job server
sends the db server the variable names per loop, from the current codebook
only. The db server counts, per unit and coder, how many of them are coded:
none, some or all. The job server writes a unit's annotation only once all
variables of that loop are coded, which is also good for efficiency.

**Does it work? Yes, and it removes the need for a loop key:**

- **No loop key needed.** Item names are unique in a codebook, so every
  variable belongs to exactly one loop of the current codebook, and the
  variable list *is* the loop's identity. Renaming a loop changes nothing.
  This also fixes "a unit in two loops shares one annotation": different
  loops have different variables.
- **Conditions.** Questions a condition skipped have no answer, so "all
  coded" would never be reached. Fix: when a unit is finished, write
  `skip: true` for every variable of the loop that wasn't asked. Then
  "all" really means finished. The client knows which steps were skipped,
  and the job server can fill in the rest.
- **Adding a question.** It automatically turns every finished unit into
  "some coded", which reopens them. That contradicts architecture.md §8.2
  ("finished units stay finished"), but gives the §8.3 "reopen" behaviour
  for free. To support both, the job server sends the set of variables that
  *define* finished for each loop: by default those of the version a unit
  was finished under (or "all current ones" when the researcher chooses to
  reopen). Simplest first version: finished = all current variables of the
  loop. Adding a question then reopens units, and the researcher is warned
  when deploying.
- **Changed codes.** Counting presence doesn't catch an answer whose code
  was removed. That is probably fine: the client already re-asks invalid
  answers when the unit is opened.
- **Cost.** One grouped count per (coder, unit) over the given variables,
  e.g. `GROUP BY coder, unit HAVING count(...)`. That is cheap with an index
  on (job, coder, unit). If the db server stores a JSON blob per unit, it
  can use JSON key functions instead. The contract only fixes the
  request and response, not the storage.
- **Endpoint sketch:**
  `POST /backend/job/:jobId/finished { loops: { main: ["q1", "q2"] }, coderId? }`
  returns `[{ coderId, unitId, loop, coded, total, created }]`. With
  `coderId` it is the workspace load; without it, it is the global load for
  dynamic loops.

**Follow-up (2026-10-16): `POST /finished` as a statistics endpoint.**
Built as: named variable groups in (the job server sends one per loop), and
per group the (unit, coder) pairs where every variable is live, with
`created` and optional values. It is used for dynamic loops (global
saturation state) and researcher status. A coder's own progress comes from
their annotations, which the job server loads in full when they show up;
that also makes redoing loops cheap. The optional `coderId` filter stays.
When building a researcher progress view, extend it to also return
partially coded units, with `coded` and `total` per (unit, coder), so
status can show "started, not finished". Not planned: a default without
groups (it can't tell finished from partial).

### 9.4 Resetting units without losing data

**Decided (2026-10-15):** `retiredAt` on rows, a unique index on live rows
only, and reset = retire. Details below.

**Idea (Kasper):** a `done`/`loop` field per annotation row, with several
rows per variable when it is used in different loops. Removing the loop
value resets the unit while keeping the data. Concern: two
`(sentiment, loop: null)` rows.

**Thoughts:** with §9.3, the loop field isn't needed for identity, so the
remaining need is *reset without deleting*. Suggestion:

- One row per (coder, unit, variable), plus `retiredAt` (null = live).
- A **unique index on live rows only**:
  `UNIQUE (coder, unit, variable) WHERE retiredAt IS NULL`. Retired rows
  can pile up without clashing. That solves the duplicate-null problem.
- **Reset** = set `retiredAt` on the unit's live rows for that loop's
  variables. The unit then counts as "none coded" and is served again. Old
  values stay for analysis, with `codebookId`, `created` and `retiredAt`.
- **Editing** a finished unit updates live rows in place (`updated`), or
  retires and re-inserts if full history matters.
- §9.3's count only counts live rows.

This is the db server's internal model, though. The contract needs a "reset
these units/variables" operation (a researcher action) and the count from
§9.3. A db server that stores JSON blobs per unit can implement reset by
moving the blob to a history table.

## 10. Decoupling db server writes: a timed outbox

Discussed 2026-10-15. **Built** (same day) as described below, with:
`POST /backend/.../annotations` (ordered batch, `rejected` for writes that
can never succeed); coder records through the same outbox (latest per
coder); flush before every read from the db server; limits 10,000 pending
or 24 h, then `503 storage_unavailable`; outbox status in the deployment
status; `SqliteOutboxStore` on Node (`ANNOTINDER_OUTBOX`), resumed on
start. Cloudflare: `DurableObjectOutboxStore` and alarms (`worker.ts`),
tested in workerd. Not built: the optional warm cache.

**Problem.** Every unit submit waits for `PUT /annotations/...` on the db
server. A slow or unavailable db server stops coding.

**Not doing:** letting the job server run without a db server (jobs pushed
from R/Python, results pulled from the job server). That makes the job
server a second database and complicates the trust story; the annotinder
db server is the place for that, and it brings auth, rate limits and
free-tier retention. Also not doing: an R session acting as db server over a
websocket (its lifetime would be the job's lifetime).

**Plan.**

- **Submit:** validate, update the in-memory codings, append the write to a
  durable **outbox** local to the job server, answer the coder. The coder's
  "ok" means "stored on the job server", not "stored on the db server".
- **Flush on a timer:** every minute (or earlier when N writes are pending),
  send pending writes as one batch; delete them once acknowledged.
- **Backoff on failure:** 1, 2, 5, then every 15 minutes. Status shows
  "N writes pending since T"; an outage is never silent.
- **Batch endpoint:** e.g. `PUT /backend/job/:jobId/annotations` with an
  array of `{unitId, coderId, variables, codebookId?}`. Idempotent (upsert per
  variable), so retrying a batch is harmless; per coder, writes stay in
  order. Coder-level writes (§11) go through the same outbox. Added to the
  conformance suite.
- **Rebuild order:** on start, read the outbox before loading codings, so
  the rebuilt state includes unflushed writes (then flush).
- **Reset/redeploy:** flush before acting on a reset or redeploy
  notification, so the db server doesn't retire rows that are still about
  to arrive.
- **Limits:** a cap on pending count and age; past it, the job server stops
  serving new units rather than buffering without bound.
- **Warm cache (optional, per job):** fetch the spec and all units up front
  (and keep them in local storage, see below), so coders with a session
  keep working through a db server outage. Cheap for text, not for
  multimedia, hence optional. New coders still need `coders/resolve`, so
  they wait for the db server.

**Why durable, not in memory.** An in-memory buffer survives a clean
shutdown (flush on SIGTERM) but loses up to a minute on a crash. On
Cloudflare it is worse: a Durable Object is evicted from memory shortly after
it goes idle, which is exactly when a coder has just finished and closed the
tab.

**Storage per target.**

- **Cloudflare:** plain Workers are stateless. The state lives in a
  **Durable Object** per deployment: one instance per id worldwide,
  single-threaded (the same model as `DeploymentRuntime`). Its memory is a
  cache, dropped when idle, so it rebuilds from the db server, which is the
  existing "reset on restart" invariant. Each object also has its own
  **transactional storage** (a small SQLite database co-located with it):
  outbox writes there are local and fast. **Alarms** wake the object at a
  set time without requests: the flush timer (and later lease expiry). A
  jurisdiction option keeps objects in the EU. The same storage can cache
  the spec and units, so a wake after idle doesn't refetch everything.
  Check Cloudflare's current limits and terms before relying on details.
- **Node:** a SQLite file (`node:sqlite`), so the Node deployment needs a
  disk.

**Invariant change.** "Rebuildable from the db server" becomes "rebuildable
from the db server once the outbox is flushed". Annotations rest on the job
server until the next flush (at most about a minute, bounded by the
limits). `architecture.md` §3 and §4 should say so when this is built.

## 11. Coder-level annotations

Discussed 2026-10-15. **Built:** `level: "unit" | "coder"` on
`POST /finished` groups (`unitId: null` for coder-level rows); the job
server loads `balanced` counts from it and coders lazily (evicted with
their workspace); status reads `GET /coders` on demand. The reference db
server stores coder-level values as rows with a null unit, the mock server
keeps them on the coder record; the conformance suite covers both through
the API. Once built parts are folded into `architecture.md`, this section
can go.

**Storage (db server's choice).** Coder-level values (survey questions,
`auto` variables) are now stored on the coder record (`variables`). A db
server may as well store them as annotation rows with `unitId = null`:
`(job, coder, null)` for coder-level, `(job, coder, unit)` for unit
annotations, as an earlier annotinder did. That gives coder-level values
the same `created`/`updated`/`codebookId`/`retiredAt` history and reset as
unit values, for free. The backend API keeps separate endpoints for coder
and unit writes either way; how they are stored is up to the db server.
Note for SQL: in a unique index, NULLs are distinct by default, so the
live-row index needs `NULLS NOT DISTINCT` (Postgres 15+), a separate partial
index for `unitId IS NULL`, or a sentinel unit id. `assignments` (sticky
loop routing) are distribution state, not annotations, and stay on the
coder record.

**Load lazily.** On start, the job server loads all coders
(`GET /coders`), including their variables. It only needs a coder's values
once that coder is active, and `coders/resolve` (called on every session
start) already returns them. So load per coder, like the unit-annotation
workspace, and drop `GET /coders` from the eager load. What the eager load
was used for, and what replaces it:

- **`balanced` auto variables** count how many coders have each option.
  Load these with the same query endpoint as finished codings (below), on
  start and for `balanced` variables only, then keep the counts up to date
  in memory as the job server assigns values.
- **Researcher status** (coders routed per loop/unitset): on demand from the
  db server, like the rest of status; or a count endpoint over
  `assignments`.
- **Leases/codings** already key on coder id and don't need coder records.

**One query endpoint.** Everything the job server reads in bulk is the same
query: *per group of variables, the rows where every variable has a live
value, optionally with the values*. Only the level differs:

| Use | Level | Group | Values | Row |
| --- | --- | --- | --- | --- |
| Finished units, loop status | unit | a loop's variables | – | (unit, coder) |
| Agreement (dynamic loops) | unit | a loop's variables | agreement variables | (unit, coder) + values |
| `balanced` counts | coder | the `balanced` variable | that variable | (coder) + value |

So `POST /finished` gets a `level: "unit" | "coder"` per group (default
`unit`); coder-level rows have `unitId: null`. With coder-level values stored
as annotation rows with a null unit (above), it is literally the same SQL
with a different unit filter. A db server that keeps them on the coder
record answers coder-level groups from there instead. The db server still
only filters and returns rows; the job server does the counting (per code,
per loop), so the endpoint stays one simple semantic. Rows per coder are
few, so returning rows instead of counts costs little. The name could
become e.g. `POST /codings` once it is more than "finished". Add
coder-level groups to the conformance suite.

With this, a job server's memory grows with *active* coders only, and a
cold start (e.g. a Durable Object waking up) is one `GET /deployment` plus
the dynamic-loop `POST /finished`.


## 12. Memory budgets and unit content hashes (built)

Discussed 2026-10-15.

**Built: memory budgets.** The job server keeps releasable state while
there is room: unit content and active coders' annotations go
least-recently-used first when over a budget (coders who are done first),
never later than `maxIdleMs` (24 h); idle deployments are dropped on Node
after `deploymentIdleMs` (6 h). Unit content is no longer re-fetched on a
timer: units shouldn't change once coding started, and a researcher refresh
(`POST /job/:jobId/deployment/refresh` with `units: "all" | ids`) drops
them on purpose. Details in `architecture.md` §3.

**Built: unit hashes,** as below: `BackendUnit.hash`, `unitHash` on
annotation writes (the hash of what the coder was shown, tracked per coder
by the job server), recorded and never refused. The mock server stores it
only when it differs from the current hash (its units become immutable once
annotated, so that is complete); the reference server stores it as given.
The conformance suite checks the hashes and that a mismatch is accepted.
Not built: the codebook content hash, and an annotation export to show
them in (the mock server has no export yet).

**Open (Kasper, 2026-10-15): hash what the coder sees, not what the db
server stores.** Planned later: *unit preprocessing* in the job server.
The client only gets the unit fields the codebook uses (any field used
anywhere in the codebook), so the db server doesn't have to deal with
that. Then a better hash may be one the job server computes over the
*extracted* fields: it says exactly what the coder was shown. Consequences:

- A codebook update that starts using another field changes the hash of
  every unit. Arguably right: the coder then sees something else.
- The db server would no longer compute or compare the hash itself (it
  can't, without knowing the extraction); it only stores what it gets.
  Letting the db server interpret the hash is tricky either way.
- What is built now (db server hashes the full `data`, the job server
  passes back the hash of what it served) would change: `BackendUnit.hash`
  might go, and `unitHash` becomes a job-server-computed value. Decide
  when unit preprocessing is designed; until then, treat `unitHash` as
  provisional.

**Design (as built): make content changes visible with hashes.** Researchers should
be able to see whether the codebook or a unit changed under an annotation.
Putting hashes on every annotation (per variable, in our storage) is
wasteful. Instead:

- **Codebook: already covered.** Deployed codebooks are immutable and every
  annotation write carries `codebookId`. A content hash on the *codebook
  record* (computed by the db server when it freezes it) adds
  cross-job/cross-server comparison ("is this the same codebook?") at no
  per-annotation cost.
- **Units: hash on the unit, checked per write.** The db server stores a
  short content hash per unit (e.g. 16 hex chars of SHA-256 over canonical
  JSON of `data`) and returns it in `BackendUnit`. The job server sends the
  hash of the content it actually served as `unitHash` on the annotation
  write: one field per unit write, like `codebookId`. That also covers the
  job server's cache: if a coder saw stale cached content, the hash says so.
  The db server then stores it as it likes. Cheapest: only record writes
  whose `unitHash` differs from the unit's current hash (normally none);
  or store a small integer unit `version` per row, like `codebookId`, if
  the db server keeps unit history anyway.
- **Export:** codebook hash and unit hash are joined in at export time, so
  every annotation in an export says what it was made on, without being
  stored per row.

**Decided:** record, never refuse (409) a write whose unit changed since
it was served; refusing would throw away a coder's work for a researcher's
edit.
