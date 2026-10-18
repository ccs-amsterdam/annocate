# Annotinder server architecture: db server + job server

Status: draft v2 (2026-10-10; v2 moves distribution into the codebook and
adds routing and invitations). First implementation in `packages/job-server`
and `packages/mock-server`. Supersedes the former design plan's §3a (unit delivery and
resumable progress) and the "heavy client, thin server" approach in §0.


How these parts combine into products (hosted, open, local, R/Python
clients): `docs/compositions.md`.

## 1. Why

The original plan kept servers thin by putting all logic in the client, so
servers could be written in Python, R and Node. That breaks down for:

- **Unit distribution across coders** (crowd coding: "code each unit until 5
  coders agree, at most 100 units per coder"). This needs a live, shared queue
  that no single client can own.
- **Validating annotations.** You can't trust the client, but re-implementing
  codebook validation (and eventually QuickJS conditions) in every server
  language is not realistic.
- **Speed.** Coders should get units fast, with caching close to them.

So the server side is split into two roles, with one shared contract
between them.

## 2. Roles

```
            researcher                          coder
                │                                  │
                ▼                                  ▼
 ┌──────────────────────────┐      ┌───────────────────────────────┐
 │ db server (any language) │◄────►│ job server (TypeScript)       │
 │  source of truth         │      │  annotinder runtime           │
 │  jobs, codebooks, units, │      │  distribution, leases         │
 │  coders, annotations     │      │  validation                   │
 │  export/analysis         │      │  unit + annotation cache      │
 └──────────────────────────┘      └───────────────────────────────┘
   researcher API                     coder API (/d/<deployment>/...)
   + backend API (/backend/...)       + admin API (/admin/...)
```

**db server.** It owns all data and is the source of truth. It can be written
in any language. It implements:

- the **researcher API** (`endpoints` in contracts), used by the client's
  admin side: jobs, codebooks, units, unitsets, invites, deployments;
- the **backend API** (`backendEndpoints` in contracts), used only by the job
  server. This is plain CRUD: deployment spec, unit content, coder
  resolution, finished codings, a coder's own annotations, and batched
  writes.

It never runs codebook logic. It validates only the shape of annotations
(JSON Schema is generated from the contracts) and referential integrity.

**job server.** This is the annotinder runtime. There is a single TypeScript
implementation, and the same code is meant to run on Node and on Cloudflare.
Coders talk only to the job server. It:

- resolves coders (via the db server) and serves the session and codebook;
- decides which unit a coder gets next, following the codebook's unit loops (fixed sets or a shared
  queue with leases, stopping rules and caps);
- validates annotations against the codebook;
- writes them through to the db server;
- caches unit content and the coder's own annotations.

**client.** No change in principle. The admin side talks to the db server.
The coder side (`HttpJobServer`, `JobManager`) talks to the job server at
`<job server>/d/<deploymentId>`, using exactly the coder endpoints it used
before.

## 3. Invariants

These are what make the job server safe to run anywhere, including an edge
worker:

1. **Durable before acknowledged, sent within a minute.** An answer is
   stored in the job server's **outbox** (a SQLite file on Node, Durable
   Object storage on Cloudflare) before the coder is told it was saved, and
   sent to the db server in a batch (`POST /backend/.../annotations`) about
   once a minute, with backoff (1, 2, 5, then every 15 minutes) while the
   db server is unreachable. Coders with a session and cached units keep
   working through an outage; past a limit (10,000 pending writes or 24 h)
   new answers are refused (`503 storage_unavailable`) rather than buffered
   forever. The researcher status shows what is pending. Before the job
   server *reads* from the db server (loading, reloading, a returning
   coder, status), it sends its pending writes, so it never reads state
   older than its own writes. `flushIntervalMs: 0` makes it write-through.
   See `outbox.ts`.
2. **Rebuildable, once the outbox is sent.** Everything else the job server
   holds is a cache of the backend API; a restart sends what the outbox
   holds before loading anything. The one exception is dynamic-source **leases**, which are
   deliberately disposable: losing them only returns an abandoned unit to
   the queue early. So the job server needs no database and no backups.
   The cache has two parts, so a rebuild doesn't need every annotation in
   memory (that matters on the edge target, with idle evictions and a
   memory limit per Durable Object):
   - **Distribution state**, loaded eagerly by `DeploymentRuntime.load()`:
     `GET /deployment` + `POST /finished`, the bulk query, for two things
     only: **loops with dynamic sources** (which coder finished which unit
     there, plus the agreement variables' values; fixed sources need no
     global state, a coder's own finished units are enough), and
     **`balanced` auto variables** (coder-level rows: which coder has which
     option).
   - **Active coders**: the coder record (coder-level values, loop
     routing) from `coders/resolve`, and their workspace, i.e. their own
     live annotations, via `GET /annotations?coderId=X`. Loaded when the
     coder shows up; their finished units in every loop are derived from
     it. Released under a memory budget (see 3.), so memory grows with active
     coders, not with all coders of a job.

   A codebook redeploy keeps the derived codings if the loops' questions,
   dynamic sources and agreement variables are unchanged. Otherwise, or
   after a researcher reset (`annotationEpoch`), it rebuilds them.
   Researcher status is computed on demand (`POST /finished` for every
   loop, `GET /coders` for routing), not held in memory.
3. **Bounded retention.** The job server keeps what it may release only
   while there is room, and never longer than a fixed bound
   (`RuntimeOptions` in `runtime.ts`, per deployment):

   | Held | Released when |
   | --- | --- |
   | Unit content | Over `unitCacheBytes` (64 MB): least recently used first. Unused for `maxIdleMs` (24 h). A researcher refresh with `units` (`"all"` or ids) drops it on purpose; otherwise units are not re-fetched, since they shouldn't change once coding started. If one does, annotations say so: each write carries `unitHash`, the hash of the content the coder was shown |
   | A coder's record and annotations | Over `workspaceCacheBytes` (32 MB): coders who were told every loop is done first, then the least recently active. Unused for `maxIdleMs`. Their finished units in loops without dynamic sources go with them, and are rebuilt when they return |
   | Distribution state (spec, dynamic-loop codings, `balanced` counts, leases) | Not released while the deployment is loaded: it is bounded by units x coders per unit, and distribution needs it |
   | The deployment as a whole | Unused for `deploymentIdleMs` (6 h) on Node; on Cloudflare when the Durable Object is evicted. Or `DELETE /admin/deployments/:id` |

   Sizes are estimated from JSON length, since JavaScript gives no memory
   pressure signal (and a Durable Object that exceeds its limit is simply
   killed). `memory` in the deployment status shows current use. This keeps
   GDPR retention simple: the job server is a processor with a short,
   documented retention window.

## 4. Trust and hosting

The job server sees units and annotations in plaintext. It must be trusted
for confidentiality, not only integrity. That is the price of putting
validation, real-valued stopping rules and caching in one place.

The mitigation is choice of deployment target, not cryptography:

- **Public edge** (Cloudflare Workers + Durable Objects). Fastest, and fine
  for non-sensitive material such as most crowd-coding jobs. `worker.ts`
  routes `/d/<id>` and `/admin/deployments/<id>` to one Durable Object per
  deployment, which runs the same app as Node for that deployment: memory
  is a cache the platform drops when idle, the outbox lives in the object's
  SQLite storage (`outboxDurable.ts`) and is flushed by alarms.
  `wrangler.toml` keeps objects in the EU jurisdiction (check Cloudflare's
  current terms). Tested in workerd via Miniflare (`worker.test.ts`).
- **Self-hosted Node** (e.g. an EU university server next to the db server).
  For sensitive data. Coders of sensitive projects are usually near that
  server anyway, so losing the edge costs little.

A possible hardening, not planned yet: encrypting participants' answers
between client and db server, so the job server never sees them
(`docs/encryption.md`).

Either way, answers rest on the job server until the next outbox flush
(normally under a minute, at most the outbox limits): its storage must be
as trusted as its memory.

A db server is configured with the job server it deploys to, and stores
which job server each job is bound to. A job server is configured with the
db servers (backends) it accepts deployments from, its own URL and an
Ed25519 key. No shared secrets (plan §13): the job server gets a short-lived
**job token** per job with a request it signs (the db server verifies it
with the job server's `/.well-known/jwks.json`), and sends it on every
backend call; the db server signs its calls to the job server with the
job's derived call key (`jobTokens.ts`, `keys.ts`;
`reference-db-server/src/jobTokens.ts` for the db server side).

## 5. Lifecycle

**Deploy.** A researcher calls `PUT /job/:jobId/deployment` on the db server
with `{ codebookId, active }`. The db server:

- bumps the deployment `version`;
- freezes the codebook;
- calls `POST /admin/deployments/<db host>/<jobId>/refresh` on the job
  server. This is best effort.

The job server also re-checks the spec version at most every `specTtlMs`
(60s), so a missed notification heals itself.

**Deployment id.** The id is `<db host>/<jobId>`, e.g. `amcat.nl/42` (or
`localhost:8787/1` in development): a job server that forgot a job finds the
db server from the id alone. Invite links point at the job server:
`<job server>/d/<db host>/<jobId>` + invite secret. Which db servers a job
server works for is `ANNOTINDER_DB_SERVERS`: an allowlist of URLs, or
`open` for any https db server (public job servers). Outbound calls never
follow redirects, time out, cap response sizes and are capped per db host
(`dbServers.ts`); the coder UI shows who hosts the job.

**Coder session.**

1. **First request.** The job server calls `POST /backend/.../coders/resolve`
   with the coder key (a hash of the session cookie's key, see
   `coder-identity.md` §4) and invite secret. The db server creates the coder if
   needed, copying the invite's preset variables. The job server then
   assigns any missing server-side `auto` variables (§7) and caches the
   coder.
2. **`GET /session`.** Served from the cache: the codebook, per-loop
   progress, and the coder's variables (so client-side conditions can use
   assigned variables).
3. **`GET /loop/:loop/next`.** On the first call for a loop, the job server
   routes the coder to a branch (§6) and stores that. It then picks a unit
   and, for a dynamic source, leases it. It then serves the unit content from its cache. On a
   cache miss it fetches the unit plus the next few prefetch candidates from
   the db server in one request. If the db server no longer has the unit, it
   is dropped from the queue and the next one is tried.
4. **`POST /variables/unit`.** The job server checks that the unit was
   assigned to this coder, validates the variables, stores them in its
   outbox (sent to the db server with the next batch), and updates the
   queue.

**Researcher preview.** `POST /job/:jobId/deployment/preview` on the db
server returns a deployment id `<db host>/<jobId>.preview` and a token
signed with the secret it shares with the job server (format in
`PreviewSessionSchema`). The client opens it like an invite. The job server
runs the latest codebook (`GET /backend/.../deployment?preview=1`, checked
on every request so edits show at once) with the real units, but keeps
coders and answers in memory (`preview.ts`): a preview writes nothing to
the db server, and is gone when the job server forgets the deployment.

**Researcher status.** `GET /job/:jobId/deployment/status` on the db server
proxies `GET /admin/deployments/:id/status`: units complete / started /
leased, codings, coders.

## 6. Distribution: the codebook describes the process

**Principle.** The codebook can name parameters, but never bind them. The
codebook is meant to be shared and reproduced. So it describes *how* units
are distributed, but it never contains unit ids or who the coders are.
There are three layers:

| Layer | Contains | Shared/reproducible? |
| --- | --- | --- |
| Codebook | questions, conditions, `unit_loop` distribution; refers to unitsets by name and to coders only via coder-level variables | yes |
| Unitsets | name -> ordered list of unit ids (e.g. `part_1`..`part_5`, `part_overlap`) | data, not process |
| Invitations | links with access rules and preset values for codebook variables | no (private to the db server) |

### 6.1 Unit loops

Defined in `contracts/src/codebook/unitLoop.ts`:

```yaml
type: unit_loop
name: main
order: random            # sequential (default) | random: per-coder shuffle, sources interleaved
maxUnits: 100            # per coder, across all sources of the branch
units:                   # first matching branch wins; no match = no units
  - when: { group: treatment }             # coder variable codes; [a, b] = any of; keys are ANDed
    sources:
      - { unitset: "part_{slot}" }         # fixed: coder gets every unit of their part
      - { unitset: part_overlap }          # fixed: everyone also gets the overlap units
  - sources:
      - unitset: pool
        dynamic: { maxCoders: 1 }          # one coder per unit, coders unknown in advance
      - unitset: reliability
        dynamic: { minCoders: 3, maxCoders: 5, agreement: { variable: sentiment, minAgree: 3 }, priority: saturate }
```

**Sources.** A unitset is just an ordered list of ids. Whether its units
are handed out *fixed* or *dynamic* is a property of the source, so the same
unitset can be used both ways.

- **Fixed.** The coder gets every unit of the set.
- **Dynamic.** A queue shared by all coders routed to it:
  - A unit is **complete** once `minCoders` (default 1) coders finished it
    and, with `agreement`, `minAgree` of them gave the same answer. It is
    also complete, regardless, once `maxCoders` coders finished it.
    `maxCoders` is required with an agreement rule, so a unit nobody agrees
    on isn't coded forever.
  - **Open slots** are codings still needed, capped by `maxCoders`, minus
    active leases. This prevents over-assignment while coders are working.
  - **Leases** last `leaseSeconds` (default 900). An expired lease frees the
    slot. A coder asking for "next" while holding a lease gets the same unit
    again, so a reload is safe.
  - **`priority`:**
    - `cover` (default) prefers least-coded units;
    - `saturate` prefers units closest to completion.

**`when`.** This is declarative (equality / any-of on coder-level variables)
rather than QuickJS. The job server evaluates it, any researcher can read
it, and it can be reproduced without a JS engine. Codebook validation checks
that `when` keys and `{placeholders}` refer to coder-level variables defined
*before* the loop, and that `when` values are among their codes.

**Routing is sticky.** The resolved unitset names are stored on the db
server per coder and loop (`assignments`, e.g. `{ main: ["part_2",
"part_overlap"] }`). A coder who later changes an answer used in `when`
keeps their units.

The example "1000 units, until 5 coders agree, max 100 per coder" is:

```yaml
order: random
maxUnits: 100
units:
  - sources: [ { unitset: __all__, dynamic: { maxCoders: 10, agreement: { variable: sentiment, minAgree: 5 } } } ]
```

### 6.2 Unitsets are explicit

Unitsets are stored lists, not recipes. That way adding units to a job never
changes an existing distribution. `POST /job/:jobId/unitsets/generate`
(and the "Split into parts…" UI) makes them easy to create:

- shuffle the units with a seed;
- set aside an overlap (`overlapUnits` or `overlapFraction`) as
  `<prefix>_overlap`;
- split the rest into `<prefix>_1..n`.

The splitting logic is a pure function, `splitUnits` in contracts.

## 7. Coder variables and invitations

**`auto` variables** are assigned, never asked, and never changed afterwards.
The client skips them as steps.

- `random`: weighted draw from `options` (job server).
- `balanced`: the option fewest coders have so far (job server). This
  spreads unknown coders evenly over `part_{slot}`. The counts come from a
  coder-level `POST /finished` query on load, then are kept in memory.
- `invite`: the value preset on the coder's invitation. If the invitation
  doesn't set one, `fallback` (`random` | `balanced`) applies, or the value
  stays empty.
- `url_param`: a query parameter of the page the coder opened (the client
  sends them as `x-url-params`). Stored when the coder starts, like the
  others, so later visits don't need it; values outside `options` (if
  given) are ignored.

The job server refuses to let the client overwrite assigned variables.
`POST /variables/coder` keeps the stored values.

**Invitations** (db server only, never in the codebook):

```json
{ "label": "Alice", "access": "only_authenticated", "emails": ["alice@uni.nl"], "maxUses": 1, "variables": { "slot": "2" } }
```

- **Routing a specific coder.** A per-coder invite with
  `variables: { slot: "2" }` routes them to `part_2`, and the codebook never
  learns who they are.
- **General links.** A link with no preset relies on the variable's
  `fallback`.
- **Enforcement today.** `maxUses` is enforced. Email restrictions are
  stored, but they need real coder authentication before they can be
  enforced. Participant ids and login are covered in
  `docs/coder-identity.md`.

## 8. Resuming, and codebook updates

### 8.1 Resuming a session (implemented)

When a coder reopens a session (reload, transfer, next day), the client
continues where they left off:

- **Top-level questions** that already have an answer that fits the current
  codebook are skipped. They stay reachable by navigating back.
- **Unit loops.** `GET /session` returns, per loop, the finished unit ids
  in order and `totalUnits` (known for fixed sources; `null` when it depends
  on other coders). The client rebuilds the loop's history from those ids,
  so the coder sees e.g. "unit 31 of 100" and can go back. Units are loaded
  only when the coder navigates to them, via
  `GET /loop/:loop/units/:unitId`. That endpoint only serves units the coder
  has answers for or currently holds, so nobody can peek ahead. New units
  still come from `GET /loop/:loop/next`, which keeps the job server in
  charge of distribution.
- **Within the unit at the frontier,** the client starts at the first
  question without a valid answer. That unit can be partly answered after a
  reload mid-unit, or after a codebook update added a question.

Finished units are identified by id, not by position: positions shift
between visits when distribution is dynamic.

### 8.2 What happens when the codebook changes

A researcher deploys a new codebook version for a running job. Answers are
keyed by question name, and the job server and client always check them
against the **current** codebook (`validateAnswer`, shared via contracts):

| Change | Units the coder already finished | Unit in progress / new units |
| --- | --- | --- |
| Question added | reopened: served again, only the new question to answer (warning on deploy) | the new question is asked |
| Question removed | old answers kept in the database, no longer shown | not asked |
| Codes changed (an answer's code removed) | stay finished; the answer is dropped from view and asked again if the coder navigates back and resubmits | asked again |
| Question renamed | = removed + added | = removed + added |
| Conditions / order changed | stay finished | follow the new codebook |
| Distribution changed | routing kept if the coder's unitsets still exist in a branch, else re-routed (§6.1) | new rules apply |

How it works:

- **Annotations are stored per (unit, coder, variable)**, with `created`,
  `updated`, `codebookId` and `retiredAt`. Only live rows (`retiredAt` empty)
  count, and only those must be unique. Writes upsert per variable, so
  answers to questions a later version removed are never overwritten. They
  stay as data, tagged with the codebook they were written under.
- **"Finished" is computed from the current codebook**: a unit is finished
  in a loop when *every* question of that loop has a live value. Questions a
  condition hid are stored as `skip`. The job server only accepts complete
  units, so a stored unit is always complete under the codebook it was
  written with. The db server only counts (`POST /finished` with the loop's
  variable names); it never runs codebook logic. Finished units are tracked
  per loop, so a unit in two loops is finished in each separately.
- **Order** in a coder's progress is the first write of the unit's values
  (`created`), so editing a finished unit doesn't move it.
- **Adding a question to a loop reopens its finished units** (they lack the
  new answer). Coders get them back first, with their earlier answers, and
  answer only what's new. Deploying such a codebook returns a warning with
  the number of affected codings.
- **Reset** (`POST /job/:jobId/annotations/reset { variables, unitIds?,
  coderIds? }`, a researcher action): retires live values instead of
  deleting them. The units are unfinished again; the old values stay for
  analysis. It bumps the deployment's `annotationEpoch`, so the job server
  reloads.

### 8.3 Open: choosing what reopens

With "finished = all current questions answered", adding a question always
reopens finished units, and a reset reopens chosen units explicitly. Still
open: letting the researcher add a question *without* reopening, e.g. by
naming the variables that define "finished" per loop (default: all). Hold
off until a real case asks for it.

Other open points:

- `totalUnits` is unknown for dynamic sources without `maxUnits`; the client
  then counts the units seen so far.

## 9. Code map

| Where | What |
| --- | --- |
| `contracts/src/codebook/unitLoop.ts` | `unit_loop` branches, fixed/dynamic sources, `when`, placeholders, legacy migration |
| `contracts/src/unitset.ts` | Unitsets, `splitUnits` generator |
| `contracts/src/deployment.ts` | Deployment schemas, `backendEndpoints`, `jobServerAdminEndpoints`, status |
| `job-server/src/app.ts` | Hono app: coder API under `/d/<db host>/<jobId>`, admin API |
| `job-server/src/dbServers.ts` | Which db servers (allowlist or open), deployment ids, outbound fetch limits |
| `job-server/src/registry.ts` | Lazily loads one runtime per deployment; failures aren't cached |
| `job-server/src/runtime.ts` | `DeploymentRuntime`: spec, caches, routing, auto variables, status |
| `job-server/src/outbox.ts` | Durable pending writes, batched flushes with backoff (`outboxSqlite.ts`: the Node store) |
| `job-server/src/session.ts` | Coder session cookies, CSRF header |
| `job-server/src/keys.ts` | The job server's Ed25519 keys: JWKS endpoint, signed requests to db servers |
| `job-server/src/jobTokens.ts` | Job tokens per (db server, job), call key, checking db server signatures |
| `job-server/src/preview.ts` | Researcher previews: preview tokens, in-memory coders and answers |
| `job-server/src/worker.ts` | Cloudflare entry: Worker routing + a Durable Object per deployment (`outboxDurable.ts`, `wrangler.toml`) |
| `job-server/src/distribution.ts` | `UnitPool` (fixed/dynamic source), `pickNext` (per-loop picking), `Codings` |
| `job-server/src/codebook.ts` | Loop/variable lookup, annotation validation, agreement keys |
| `job-server/src/backend.ts` | Typed backend API client; validates db server responses |
| `reference-db-server/src/server.ts` | Reference backend API: the whole db server side, in memory |
| `conformance/src/index.ts` | Backend API conformance suite, runnable against any db server |
| `mock-server/src/routes/backend.ts` | The dev server's backend API (sqlite) |
| `mock-server/src/routes/deployment.ts` | Researcher deployment endpoints, job server notification |
| `client/.../admin/UnitLoopForm.tsx` | Editor for loop branches and sources |

`job-server/src/__tests__/integration.test.ts` runs the real mock server and
job server against each other, through in-process `fetch`;
`reference-db-server/src/__tests__/jobServer.test.ts` does the same with the
reference db server. Both db servers run the conformance suite in their tests.

## 10. Open questions and next steps

Roughly in order:

1. **Auth.** Between the servers: done for allowlisted db servers (plan
   §13); open job servers, deployment ids from the db host and outbound
   caps are next there. Coder identity, sessions across devices and coder
   login are designed in `docs/coder-identity.md`.
2. **Multimedia.** Images, audio and video in units should probably **not**
   flow through the JSON path. Proposal: units reference media by id; the job
   server returns short-lived signed URLs; the bytes come from a separate
   blob gateway. That could be R2 with signed URLs for the edge target, or
   the db server's own file endpoint for self-hosted. This keeps the job
   server's memory and cache JSON-only. The blob gateway follows the same
   trust choice as the job server it pairs with.
3. **Semantic validation.** The current validation checks variable names,
   codes, items and span/relation codes. Running codebook conditions
   (QuickJS) server-side, to reject answers to questions the coder should
   never have seen, is the natural next step. It belongs here, not in db
   servers.
4. **Email-restricted invites** need real coder authentication (item 1).
5. **Scale.** On cold start the job server loads finished codings for
   dynamic loops only (bounded by units x `maxCoders`), and coder workspaces
   lazily (§3). Add `?after=<cursor>` pagination to `finished` and
   `annotations`. Researcher status queries every loop's finished units on
   demand: fine for occasional use, worth an aggregate endpoint if it gets
   polled.
6. **Deactivation semantics.** `active: false` stops new units (409), but
   coders can still submit units they were already working on. Decide
   whether that's what researchers expect.
7. **Reopening finished units after a codebook update** (§8.3).
