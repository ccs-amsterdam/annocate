# Plan: open job servers, coder sessions, finished codings, cleanup

Status: discussion summary and work plan (2026-10-15). Nothing here is built
yet. Complements `docs/architecture.md` and `docs/coder-identity.md`; once a
part is built, fold it into those docs and delete it here.

## 0. Where things stand

- Branch `annotinder-client` has **uncommitted changes** from the
  "does the job server need every annotation" work:
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

- **Delete `old/`** (2.5 MB, the previous NextJS app). Remove the mention in
  `README.md`. Check first that nothing still ports from it.
- **`annotinder-client_design_plan.txt`** (1392 lines): ~48 source files
  have comments referring to "design plan §x". Move the decisions that still
  hold into `docs/` (architecture, `packages/contracts/CONTRACTS.md`), point
  the comments there or drop them, then delete the file.
- **`TODO.txt`**: UI/feature notes, not a plan. Keep, or move to issues.
- Remaining `TODO(phase N)` comments: resolve or turn into issues.
- **This document**: fold the built parts into `architecture.md` /
  `coder-identity.md` as they land, then delete it.
- `docs/architecture.md` §10 (open questions): update to match.

## 7. Order of work

1. **Cleanup** (§6). Independent, low risk, makes the rest easier to read.
2. **Codings model** (§4): loop in the annotation key, row exists =
   finished, `created` ordering, global load only for dynamic loops, lazy
   workspaces. Rework or replace the uncommitted changes (§0).
3. **Mock server split + conformance suite** (§5). Right after (2), since
   (2) changes the backend API anyway.
4. **Sessions in httpOnly cookies** (§2), client and job server on one
   origin; signed coder session; db server stops storing coder keys.
5. **Trust handshake** (§1): invite token, registration, signed handshake,
   job tokens, outbound fetch hygiene, quotas.
6. **Authentication** (§3).

## 8. Open decisions

- Uncommitted changes: commit as WIP, or discard (§0).
- Reopening anonymous invites on the same device (§2).
- Delegated access, i.e. whether to keep provider refresh tokens (§3).
- Returning coders after the job server forgot the job: deployment id
  encodes the db URL, or the client keeps the invite token (§1).
- Registration on public job servers: open, rate-limited, or account/API
  key (§1).
- Status: computed on demand or db-side aggregates (§4).
