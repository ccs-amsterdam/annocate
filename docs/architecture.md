# Annotinder server architecture

Status: current (2026-10-26). One server, `packages/server`, on Postgres:
`pg` against a Postgres server in production, PGlite (Postgres in
WebAssembly, in process) for tests and development.

How the server and client combine into products (hosted, self-hosted,
local, R/Python clients): `docs/compositions.md`.

## 1. Why a server with logic

Keeping all logic in the client, so servers could be thin and written in any
language, breaks down for:

- **Unit distribution across coders** (crowd coding: "code each unit until 5
  coders agree, at most 100 units per coder"). This needs a live, shared queue
  that no single client can own.
- **Validating annotations.** You can't trust the client.

So the server (TypeScript) runs the job: distribution, validation, sessions.
Other systems (AmCAT, R, Python) don't run a server of their own: they use
the researcher API to push units, codebooks and settings, and to download
annotations. (An earlier design split the server into a "db server" in any
language and a "job server"; it was merged back on 2026-10-26, since that
split cost an API and a trust scheme between the two and served no real
case.)

## 2. Roles

```
      researcher, R, Python, AmCAT                   coder
                │ researcher API                       │ coder API
                ▼ /job/...                             ▼ /d/<deploymentId>/...
 ┌─────────────────────────────────────────────────────────────────────┐
 │ server (TypeScript, packages/server)                                │
 │  researcher API: jobs, codebooks, units, unitsets, invitations,     │
 │    deployment, progress, results                                    │
 │  runtime (one per deployment, in memory): distribution, leases,     │
 │    validation, unit + annotation cache                              │
 │  database: the source of truth                                      │
 └─────────────────────────────────────────────────────────────────────┘
```

The server serves two APIs; [`docs/api/`](api/README.md) has the overview
and a page per API, with a section per endpoint.

- the **researcher API** (`researcherEndpoints`, [spec](api/researcher.md)),
  at `/job/...`, `/me` and `/auth/...`: used by the client's researcher UI
  (session cookie after logging in), scripts (R, Python) and other systems
  (API keys). Login and keys: `coder-identity.md` §7.
- the **coder API** (`coderEndpoints`, [spec](api/coder.md)), at
  `/d/<deploymentId>/...`: used by the client's annotator. A deployment id is
  the job id, or `<jobId>.preview` for a researcher preview. No CORS: the
  session is an httpOnly cookie on the client's origin (`coder.ts`).

**The runtime** (`src/runtime/`) runs a deployed job for coders. It:

- resolves coders and serves the session and codebook;
- decides which unit a coder gets next, following the codebook's unit
  loops (fixed sets or a shared queue with leases, stopping rules and caps);
- validates annotations against the codebook;
- writes them to the database;
- caches unit content and the coder's own annotations.

It reads and writes through a `Store` (`store.ts`): `DbStore` for the
database, `PreviewStore` for previews.

**client.** The researcher UI (`ResearcherApi`) talks to the researcher API,
the annotator (`HttpCoderApi`, `JobManager`) to the coder API. The client
and the server share an origin, since sessions are httpOnly cookies; in
development, Vite proxies the server's paths.

## 3. Invariants

1. **Stored before acknowledged.** An answer is written to the database
   before the coder is told it was saved. There is no buffering.
2. **Rebuildable.** Everything the runtime holds in memory is a cache of the
   database, except dynamic-source **leases**, which are deliberately
   disposable: losing them only returns an abandoned unit to the queue
   early. A restart loads what it needs again. The cache has two parts, so
   a rebuild doesn't need every annotation in memory:
   - **Distribution state**, loaded eagerly by `DeploymentRuntime.load()`:
     the deployment spec and the bulk `listFinished` query, for two things
     only: **loops with dynamic sources** (which coder finished which unit
     there, plus the agreement variables' values; fixed sources need no
     global state, a coder's own finished units are enough), and
     **`balanced` auto variables** (coder-level rows: which coder has which
     option).
   - **Active coders**: the coder record (coder-level values, loop
     routing) and their workspace, i.e. their own live annotations. Loaded
     when the coder shows up; their finished units in every loop are
     derived from it. Released under a memory budget (see 3.), so memory
     grows with active coders, not with all coders of a job.

   A codebook redeploy keeps the derived codings if the loops' questions,
   dynamic sources and agreement variables are unchanged. Otherwise, or
   after a researcher reset (`annotationEpoch`), it rebuilds them.
   Researcher status is computed on demand (finished units for every loop,
   all coders for routing), not held in memory.
3. **Bounded memory.** The runtime keeps what it may release only while
   there is room, and never longer than a fixed bound (`RuntimeOptions` in
   `runtime.ts`, per deployment):

   | Held | Released when |
   | --- | --- |
   | Unit content | Over `unitCacheBytes` (64 MB): least recently used first. Unused for `maxIdleMs` (24 h). A researcher refresh with `units` (`"all"` or ids) drops it on purpose; otherwise units are not re-read, since they shouldn't change once coding started. If one does, annotations say so: each write carries `unitHash`, the hash of the content the coder was shown |
   | A coder's record and annotations | Over `workspaceCacheBytes` (32 MB): coders who were told every loop is done first, then the least recently active. Unused for `maxIdleMs`. Their finished units in loops without dynamic sources go with them, and are rebuilt when they return |
   | Distribution state (spec, dynamic-loop codings, `balanced` counts, leases) | Not released while the deployment is loaded: it is bounded by units x coders per unit, and distribution needs it |
   | The deployment as a whole | Unused for `deploymentIdleMs` (6 h), or when the job is deleted |

   Sizes are estimated from JSON length, since JavaScript gives no memory
   pressure signal. `memory` in the deployment status shows current use.
4. **One process.** Leases and the dynamic-loop codings live in the memory
   of one process (`registry.ts`). Running several server processes would
   need them in the database (§10).

## 4. Trust and hosting

The server sees units and answers in plaintext, like any web application
that stores them. Where it runs is the researcher's choice: annotinder.com
(hosted by us, in the EU), or self-hosted (e.g. a university server) for
sensitive data.

A possible hardening, not planned yet: encrypting participants' answers in
the client, so the server stores only ciphertext (`docs/encryption.md`).

## 5. Lifecycle

**Deploy.** A researcher calls `PUT /job/:jobId/deployment` with
`{ codebookId, active }`. The server bumps the deployment `version`, freezes
the codebook, and has a loaded runtime re-read the deployment
(`Deployments.refresh`). A runtime also re-checks the spec version at most
every `specTtlMs` (60s).

**Coder links.** Invite links point at the client with the deployment id
(the job id) and the invite secret; the client calls `/d/<jobId>/...`.

**Coder session.**

1. **First request.** The runtime resolves the coder by coder key (a hash
   of the session cookie's key, see `coder-identity.md` §4) and invite
   secret, creating the coder if needed and copying the invite's preset
   variables. It then assigns any missing server-side `auto` variables (§7)
   and caches the coder.
2. **`GET /session`.** Served from the cache: the codebook, per-loop
   progress, and the coder's variables (so client-side conditions can use
   assigned variables).
3. **`GET /loop/:loop/next`.** On the first call for a loop, the runtime
   routes the coder to a branch (§6) and stores that. It then picks a unit
   and, for a dynamic source, leases it, and serves the unit content from
   its cache. On a cache miss it reads the unit plus the next few prefetch
   candidates in one query. If a unit no longer exists, it is dropped from
   the queue and the next one is tried.
4. **`POST /variables/unit`.** The runtime checks that the unit was assigned
   to this coder, validates the variables, writes them to the database, and
   updates the queue.

**Researcher preview.** `POST /job/:jobId/deployment/preview` returns
deployment id `<jobId>.preview` and a token signed with the server's secret
(`ANNOTINDER_SECRET`; random per process if not set, so previews then end
with a restart). The client opens it like an invite. The runtime runs the
latest codebook (checked on every request, so edits show at once) with the
real units, but keeps coders and answers in memory (`preview.ts`): a
preview stores nothing, and is gone when the server forgets the deployment.

**Researcher status.** `GET /job/:jobId/deployment/status`: units complete /
started / leased, codings, coders, and the runtime's memory use.

## 6. Distribution: the codebook describes the process

**Principle.** The codebook can name parameters, but never bind them. The
codebook is meant to be shared and reproduced. So it describes *how* units
are distributed, but it never contains unit ids or who the coders are.
There are three layers:

| Layer | Contains | Shared/reproducible? |
| --- | --- | --- |
| Codebook | questions, conditions, `unit_loop` distribution; refers to unitsets by name and to coders only via coder-level variables | yes |
| Unitsets | name -> ordered list of unit ids (e.g. `part_1`..`part_5`, `part_overlap`) | data, not process |
| Invitations | links with access rules and preset values for codebook variables | no (stored on the server only) |

### 6.1 Unit loops

Defined in `contracts/src/codebook/unitLoop.ts`:

```yaml
type: unit_loop
name: main
order: random            # sequential (default) | random: per-coder shuffle, sources interleaved
maxUnits: 100            # per coder, across all sources of the branch
units:                   # first matching branch wins; no match = no units
  - when:                                  # a condition (rules or script) on coder-level questions
      rules: [ { ref: $var.group.code, op: is, value: treatment } ]
    sources:
      - { unitset: "part_$var.slot.code" } # fixed: coder gets every unit of their part
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

**`when`.** The same condition as a `condition` item (rules or a script,
`client.md` "References and conditions"), on coder-level questions from
before the loop. Unitset names can contain `$var` references, filled in
with the coder's answer as text. Codebook validation checks both.

**The client chooses the branch.** When it enters a loop, the client
evaluates the branches in order, takes the first that matches, fills in its
unitset names, and asks `GET /loop/:loop/next?branch=<i>&unitsets=<names>`.
The runtime checks that the branch exists, that the names fit that
branch's sources (`unitsetMatchesSource`) and that the unitsets exist, and
stores them. A loop with a single unconditional branch without references
routes without the parameters; any other loop answers 409
`branch_required` until the client chooses. If no branch matches, the
coder has no units in the loop. This way the server never needs the
answers a branch depends on, which is what end-to-end encryption needs
(`encryption.md`, "Routing on answers").

*Trust trade-off.* A coder can choose their own branch, by sending another
branch index, or other unitset names that fit a branch's sources (e.g.
`part_3` instead of `part_2`). The server only guarantees that a coder gets
units of a unitset the codebook could route *someone* to. Routing is a
convenience for the researcher, not access control. `auto` assignment
(random, balanced, invite) itself stays on the server, so a coder can't
change their stored group; only which units they ask for. If a study needs
the routing enforced, a strict mode could later check the filled-in names
against server-held `auto` values (only possible for unencrypted ones).

**Routing is sticky.** The resolved unitset names are stored per coder
and loop (`assignments`, e.g. `{ main: ["part_2",
"part_overlap"] }`), and later choices are ignored. A coder who later
changes an answer used in `when` keeps their units, as long as the codebook
still has a branch that produces the same names.

The example "1000 units, until 5 coders agree, max 100 per coder" is:

```yaml
order: random
maxUnits: 100
units:
  - sources: [ { unitset: __all__, dynamic: { maxCoders: 10, agreement: { variable: sentiment, minAgree: 5 } } } ]
```

### 6.2 Unitsets are explicit

Unitsets are stored lists, not recipes. That way adding units to a job never
changes an existing distribution. The researcher UI's "Split into parts"
makes them easy to create (in the client, then stored with
`POST /job/:jobId/unitsets`):

- shuffle the units with a seed;
- set aside an overlap (`overlapUnits` or `overlapFraction`) as
  `<prefix>_overlap`;
- split the rest into `<prefix>_1..n`.

The splitting logic is a pure function, `splitUnits` in contracts.

## 7. Coder variables and invitations

**`auto` variables** are assigned, never asked, and never changed afterwards.
The client skips them as steps.

- `random`: weighted draw from `options` (server).
- `balanced`: the option fewest coders have so far (server). This
  spreads unknown coders evenly over `part_$var.slot.code`. The counts come from a
  coder-level `listFinished` query on load, then are kept in memory.
- `invite`: the value preset on the coder's invitation. If the invitation
  doesn't set one, `fallback` (`random` | `balanced`) applies, or the value
  stays empty.
- `url_param`: a query parameter of the page the coder opened (the client
  sends them as `x-url-params`). Stored when the coder starts, like the
  others, so later visits don't need it; values outside `options` (if
  given) are ignored.

The server refuses to let the client overwrite assigned variables.
`POST /variables/coder` keeps the stored values.

**Invitations** (stored on the server, never in the codebook):

```json
{ "label": "Alice", "auth": "required", "emails": ["alice@uni.nl"], "maxUses": 1, "variables": { "slot": "2" } }
```

- **Routing a specific coder.** A per-coder invite with
  `variables: { slot: "2" }` routes them to `part_2`, and the codebook never
  learns who they are.
- **General links.** A link with no preset relies on the variable's
  `fallback`.
- **Enforcement today.** `maxUses` is enforced. Email restrictions are
  stored, but need coder login before they can be enforced; until then
  `auth: "required"` invites are refused. Participant ids and login:
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
  still come from `GET /loop/:loop/next`, which keeps the server in
  charge of distribution.
- **Within the unit at the frontier,** the client starts at the first
  question without a valid answer. That unit can be partly answered after a
  reload mid-unit, or after a codebook update added a question.

Finished units are identified by id, not by position: positions shift
between visits when distribution is dynamic.

### 8.2 What happens when the codebook changes

A researcher deploys a new codebook version for a running job. Answers are
keyed by question name, and the server and client always check them
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
  condition hid are stored as `skip`. The runtime only accepts complete
  units, so a stored unit is always complete under the codebook it was
  written with. The database query only counts (`listFinished` with the
  loop's variable names); the codebook logic stays in the runtime. Finished units are tracked
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
  analysis. It bumps the deployment's `annotationEpoch`, so the runtime
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
| `contracts/src/codebook/unitLoop.ts` | `unit_loop` branches, fixed/dynamic sources, `when`, unitset references, legacy migration |
| `contracts/src/codebook/references.ts`, `condition.ts` | `$unit`/`$var`/`$const` references, template parsing, scopes; conditions (rules or script) and rule evaluation |
| `contracts/src/unitset.ts` | Unitsets, `splitUnits` generator |
| `contracts/src/deployment.ts` | Deployment, status, refresh and preview schemas (researcher API) |
| `contracts/src/endpoints/` | The two API registries: researcher, coder ([docs/api](api/README.md)) |
| `server/src/app.ts` | Hono app: researcher API under `/job/...`, coder API under `/d/<deploymentId>` |
| `server/src/coder.ts` | The coder API routes: session cookie, coder resolution, units, answers, transfers |
| `server/src/researcher/` | The researcher API, one file per path; `auth.ts` (sessions, API keys, dev headers), `login.ts` (`/auth/...`) |
| `server/src/oidc.ts`, `shared/accounts.ts`, `shared/sessions.ts` | Researcher login with an OpenID Connect provider, users and API keys, sessions |
| `server/src/shared/` | Database queries shared by both APIs (deployments, finished units, units, coders, ...) |
| `server/migrations/`, `src/db.ts` | The data model (numbered SQL migrations) and the database (`Sql`: `pg` or PGlite) |
| `server/src/runtime/registry.ts` | `Deployments`: lazily loads one runtime per deployment; failures aren't cached; refresh, status, preview tokens |
| `server/src/runtime/runtime.ts` | `DeploymentRuntime`: spec, caches, routing, auto variables, status |
| `server/src/runtime/store.ts` | `Store`: what the runtime reads and writes; `DbStore` on the database |
| `server/src/runtime/types.ts` | The runtime's internal types (spec, coder, annotations, finished rows) |
| `server/src/runtime/session.ts` | Coder session cookies, CSRF header |
| `server/src/runtime/preview.ts` | Researcher previews: preview tokens, `PreviewStore` with in-memory coders and answers |
| `server/src/runtime/distribution.ts` | `UnitPool` (fixed/dynamic source), `pickNext` (per-loop picking), `Codings` |
| `server/src/runtime/codebook.ts` | Loop/variable lookup, annotation validation, agreement keys |
| `client/.../admin/UnitLoopForm.tsx` | Editor for loop branches and sources |

Tests (`server/src/__tests__/`) run through the app's fetch handler on
PGlite (or a Postgres server with `TEST_DATABASE_URL`): `coder.test.ts`
runs coders end to end (a new app on the same database is a restart),
`app.test.ts` the researcher API and the store's queries,
`researcherApi.test.ts` the API as a script uses it (responses checked
against the contract schemas), `login.test.ts` login against a mock
provider.

## 10. Open questions and next steps

Roughly in order:

1. **Coder login** (`coder-identity.md` §5), on the researcher login's code.
   Email-restricted invites (`auth: "required"`) need it.
2. **Publishing follow-ups.**
   - The coder's browser follows a new version: the server switches at the
     next request, but the client keeps the codebook it loaded with the
     session, so a coder could answer removed questions or miss new ones.
     Put the deployment `version` in session and unit responses, and reload
     the session when it changes.
   - A dry run of a publish, so the reopen warnings (§8.2) show before
     confirming instead of after.
   - Pausing a job from the UI (`active: false`), and deciding what pausing
     means: today it stops new units (409), but coders can still submit
     units they hold.
   - Choosing what reopens after a codebook update (§8.3).
3. **Local coding from R and Python** (`compositions.md`): the runtime in
   the browser, R or Python as the host; then the R and Python packages.
   (Not a standalone local app or binaries: see "Not planned" there.)
4. **Researcher API follow-ups.** A webhook that posts new annotations; a
   download button in the researcher UI; per coder whether they are done
   (only the runtime knows how many units a coder gets); changing a unit
   field's type.
5. **Limits.** Rate and resource limits, and quotas per account (e.g. a
   course hands out a number of jobs per student).
6. **Hashes.** A codebook content hash, and a unit hash over the fields the
   codebook uses (after unit preprocessing) instead of the full data. Until
   then `unitHash` is provisional.
7. **Keeping history.** When units are updated after being coded, keep a
   copy of the old version; keep older versions of annotations. (Today an
   annotation written with an old `codebookId` after a reset is stored as
   is.)
8. **Sessions.** For coders: a device id across jobs versus today's session
   key per job; reopening anonymous invites on the same device. For
   researchers: a list of active sessions, logging out everywhere, logging
   out at the provider.
9. **Multimedia.** Images, audio and video in units should probably **not**
   flow through the JSON path. Proposal: units reference media by id; the
   server returns short-lived signed URLs to a blob store. This keeps the
   runtime's memory and cache JSON-only.
10. **Semantic validation.** Validation checks variable names, codes, items
    and span/relation codes. Running codebook conditions (QuickJS)
    server-side, to reject answers to questions the coder should never
    have seen, would be the next step. Conditions and branch choice run on
    the client today (§6.1), which keeps client-side encryption of answers
    possible (`encryption.md`).
11. **Scale.** On cold start the runtime loads finished codings for dynamic
    loops only (bounded by units x `maxCoders`), and coder workspaces
    lazily (§3). Researcher status is computed on demand: fine for
    occasional use; aggregates kept in the database if it gets polled.
    More than one server process needs leases and codings in the database
    (§3.4); with Postgres, e.g. leases as rows picked with
    `FOR UPDATE SKIP LOCKED`.
12. **Admin unit cache.** A client-side cache of units for the researcher
    UI (IndexedDB), compared by ids and hashes.

Smaller things worth an issue: a swipe-card UI for the `annotinder` answer
type; `VariableValue` as a discriminated union; a live preview of a
codebook item while editing it. Client gaps: `client.md` §9.
