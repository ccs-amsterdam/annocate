# Plan: open job servers, coder sessions, finished codings, cleanup

Status: discussion summary and work plan (2026-10-15). Nothing here is built
yet. Complements `docs/architecture.md` and `docs/coder-identity.md`; once a
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

- **Reference db server**: only the backend API, from a fixture file or a
  few tables. Small enough to read as the spec.
- **Conformance test suite**, runnable against any db server URL. Worth more
  to a real implementer (AmCAT) than example code.
- **Dev server** for the client's admin side, separate (in practice maybe
  whatever the real db server is).
- Remove the legacy coder routes and the `doneUnitIds` column once the admin
  preview goes through the job server (architecture.md §10.1).

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
3. **Mock server split + conformance suite** (§5). Right after (2), since
   (2) changes the backend API anyway.
4. **Sessions in httpOnly cookies** (§2), client and job server on one
   origin; signed coder session; db server stops storing coder keys.
5. **Trust handshake** (§1): invite token, registration, signed handshake,
   job tokens, outbound fetch hygiene, quotas.
6. **Authentication** (§3).

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
