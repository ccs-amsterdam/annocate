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
 │  researcher API: jobs, codebooks, units, sets, links (invites),     │
 │    deployment, progress, results                                    │
 │  runtime (per deployment): distribution, leases, validation;        │
 │    state in the database, only the deployment spec in memory        │
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
  loops (all units or one set, a shared queue with leases and stopping
  rules, or one set of a group per coder; plus an overlap);
- validates annotations against the codebook;
- writes them to the database;
- keeps only the deployment spec in memory (§3): any number of server
  processes can serve a job.

It reads and writes through a `Store` (`store.ts`): `DbStore` for the
database, `PreviewStore` for previews.

**client.** The researcher UI (`ResearcherApi`) talks to the researcher API,
the annotator (`HttpCoderApi`, `JobManager`) to the coder API. The client
and the server share an origin, since sessions are httpOnly cookies; in
development, Vite proxies the server's paths.

## 3. Invariants

1. **Stored before acknowledged.** An answer is written to the database
   before the coder is told it was saved. There is no buffering.
2. **The database holds the state.** The runtime reads per request what it
   works with: the coder (one indexed query by device key), their answers,
   units and the unit versions shown, finished codings (`unit_codings`),
   the leases of shared queues (`unit_leases`), transfer links. In memory it
   keeps only the deployment spec, re-read when the deployment's stamp
   changes (version, annotation epoch, `revision`, suspension: one small
   query per request; researcher changes bump `revision`). So any number of
   server processes can serve the same job
   (§10 has what is left).
3. **Decisions that count other coders run under a lock.** Picking from a
   shared queue (and leasing the unit), drawing a balanced set (`assign` mode)
   and a `balanced` group run in one transaction holding a database lock on
   that queue, group or variable (`Store.locked`, `pg_advisory_xact_lock`),
   so two coders, on any process, never get the same slot.
4. **Finished codings are derived, and kept in step.** A unit is finished in
   a loop when the coder answered every question of it (§8.2):
   `unit_codings` has a row per finished (loop, unit, coder), with the
   answers to the loop's agreement questions, written with the answers.
   What finishes a loop depends on the codebook, so when that changes (a
   redeploy whose loops have other positions, questions or agreement
   questions: `codingsSignature`) or
   answers are reset (`annotationEpoch`), they are derived from the answers
   again, once (`deployments.codings_basis`; the first process to get the
   lock does it).

Previews are the exception: they keep their coders and answers in the
memory of one process (`preview.ts`).

## 4. Trust and hosting

The server sees units and answers in plaintext, like any web application
that stores them. Where it runs is the researcher's choice: annotinder.com
(hosted by us, in the EU), or self-hosted (e.g. a university server) for
sensitive data.

A possible hardening, not planned yet: encrypting participants' answers in
the client, so the server stores only ciphertext (`plans/encryption.md`).

## 5. Lifecycle

**Deploy.** A researcher calls `PUT /job/:jobId/deployment` with
`{ codebookId, active }`. The server bumps the deployment `version`, freezes
the codebook. Every runtime checks the deployment's stamp on each request
and re-reads it when it changed; researcher changes that don't publish
(units, sets, job settings) bump `deployments.revision` for that
(`Deployments.refresh`). Coders' browsers send the version their codebook belongs
to; requests with an older one get 409 `codebook_changed`, and the client
loads the session again (`api/coder.md`).

**Coder links.** Links (invites) are made by publishing: one per
combination of the codebook's link parameter values (§7). They point at the
client with the deployment id (the job id) and the link's secret; the
client calls `/d/<jobId>/...`.

**Coder session.**

1. **First request.** The runtime resolves the coder by device key (a hash
   of the device cookie's id, the deployment and the participant id, see
   `coder-identity.md` §4) and link
   secret, creating the coder if needed and storing its `$session` values
   (the link's parameter values, URL parameters, `source`, §7); on every
   request after that, one query finds it.
2. **`GET /session`.** Assigns any missing server-side `auto` variables
   (§7), then returns the codebook, per-loop progress, and the coder's
   variables (so client-side conditions can use assigned variables).
3. **`GET /loop/:loop/next?count=k`.** On the first call for a loop, the
   runtime routes the coder to a branch (§6) and stores that. It then picks
   the coder's next k units (unfinished ones first) and, in a shared queue,
   leases them, reads them, and records the versions shown (`unit_serves`).
   A unit that no longer exists is skipped. The client asks for a batch (5)
   and again in the background before it runs out.
4. **`POST /variables/unit`.** The runtime checks that the unit was assigned
   to this coder, validates the variables, and writes them (and the
   codings they finish) to the database. The client sends answers in the
   background, one post at a time, in order (`JobManager.save`): the coder
   goes on at once. A failure for lack of a connection is tried again; the
   end of the session waits until everything is saved.

**Researcher preview.** `POST /job/:jobId/deployment/preview` returns
deployment id `<jobId>.preview` and a token signed with the server's secret
(`ANNOTINDER_SECRET`; random per process if not set, so previews then end
with a restart). The client opens it like an invite. The runtime runs the
latest codebook (checked on every request, so edits show at once) with the
real units, but keeps coders and answers in memory (`preview.ts`): a
preview stores nothing, and is gone when the server forgets the deployment.

**Researcher status.** `GET /job/:jobId/deployment/status`: units complete /
started / leased, codings and coders.

## 6. Distribution: the codebook describes the process

**Principle.** The codebook can name parameters, but never bind them. The
codebook is meant to be shared and reproduced. So it describes *how* units
are distributed, but it never contains unit ids or who the coders are.
There are three layers:

| Layer | Contains | Shared/reproducible? |
| --- | --- | --- |
| Codebook | questions, conditions, `unit_loop` distribution, session parameters; refers to set groups and sets by name and to coders only via coder-level variables and `$session` values | yes |
| Sets | per group, named sets of units in order (e.g. group `parts`: `s1`..`s5`, `_overlap`) | data, not process |
| Links | made from the codebook's link parameters, with access rules (login, emails, max uses, a fixed participant id) | no (stored on the server only) |

### 6.1 Unit loops

Defined in `contracts/src/codebook/unitLoop.ts`. A loop has branches (the
first whose `when` matches is used; no match = no units). Each branch has a
**mode**, which says which units a coder gets, and (in `shared` and
`assign`) an **overlap**:

```yaml
type: unit_loop
label: News items        # optional: shown in the editor, progress and exports
order: random            # sequential (default, the set's order) | random: each coder their own order
units:
  - when:                                # a condition on coder-level questions or $session values
      script: $var.group.is("treatment")
    mode: all                            # every coder codes every unit of the set
    set: { group: condition, set: treatment }   # omit for all units
  - mode: shared                         # a queue: each unit until N coders coded it, or N agree
    set: { group: parts, set: queue }    # optional; omit for all units
    until: { agree: 3, on: sentiment }   # or { coders: 1 }
    maxCoders: 5
    maxUnits: 100                        # per coder
    overlap: { placement: spread }       # the group's _overlap units
  - mode: assign                         # each coder gets one set of a group
    group: parts
    from: { draw: balanced }             # or { draw: random }, or { session: <name> | participant | email }
    overlap: { placement: spread, expect: 50 }   # required: first | last | spread | disabled
```

**Modes:**

- **`all`**: every coder of the branch codes every unit (of the job, or of
  `set`).
- **`shared`**: a queue shared by all coders of the branch, over all units
  or one `set`:
  - A unit is **done** once `until.coders` coders finished it, or once
    `until.agree` of them gave the same answer to `until.on` (a question of
    the loop with one categorical answer: nominal without `multiple`,
    ordinal, swipe). It is also done, regardless, once `maxCoders` coders
    finished it. `maxCoders` is required with `agree`, so a unit nobody
    agrees on isn't coded forever.
  - `maxUnits` caps the units per coder (besides the overlap).
  - **Open slots** are codings still needed, capped by `maxCoders`, minus
    active leases. This prevents over-assignment while coders are working.
  - Without open slots, a coder gets any unit that isn't **full**
    (`isFull`): finished codings below `maxCoders` (leases don't count;
    without `maxCoders`, below `until.coders`) and, with `agree`, not
    agreed on. Least coded first (codings plus leases). So a coder only
    gets nothing when every unit is full (`Reach` in
    `runtime/distribution.ts`).
  - `minUnits`: while a coder has fewer units, `maxCoders` gives way too:
    any unit not agreed on (`agree`), or any unit (`coders`), least coded
    first.
  - **Leases** last `leaseSeconds` (default 900). An expired lease frees the
    slot. A coder asking for "next" while holding leases gets the same units
    again (their leases renewed), so a reload is safe. Finishing a unit
    drops the coder's lease on it (in the same transaction as the coding);
    a pick therefore reads the leases before the codings, so a unit
    finished in between is seen as a coding.
  - **`priority`:** `cover` (default) prefers least-coded units;
    `saturate` prefers units closest to done.
- **`assign`**: each coder gets one set of `group` (its sets besides
  `_overlap`). `from` says which: `{ draw: "balanced" }`, the set with the
  fewest coders so far (the first of those; a coder counts for their set if
  they finished it, or were routed or finished a unit in the last 24 hours,
  `SET_ACTIVITY_MS`, so the set of a coder who dropped out is handed out
  again); `{ draw: "random" }`; or `{ session: name }`, the set a session
  value names: a set-typed link or URL parameter of the group (§7), the
  `participant` id, or the login `email` (login required; only emails that
  are set names of the group can start, others get 403
  `email_not_invited`). A value that names no set gives no units.

**Overlap.** The group's `_overlap` units, which every coder of the branch
codes in full besides their own units, e.g. for intercoder reliability
(and gold units). `placement`: `first`, `last`, `spread` evenly through
them, or `disabled`; required in `assign` mode (a deliberate choice), and
in `shared` mode only with a `set`. Optional: `expect` (a publish warning
when the group has fewer overlap units), and `max` with `pick` (`first` or
a seeded `random` draw) to use at most that many. A coder's own set leaves
out units that are also overlap units. Spreading needs to know how many
units a coder gets: their set's size, or in `shared` mode `maxUnits`
(required there for `spread`). If a coder runs out of own units sooner,
the overlap units left come at the end.

The pools behind this are internal (`server/src/runtime/distribution.ts`):
a branch is a pool for the coder's own units (a queue in `shared` mode,
else fixed) and a fixed pool for the overlap.

**`when`.** The same condition as a `condition` item (a script,
`client.md` "References and conditions"), on coder-level questions from
before the loop, and `$session` values. Sets are named literally (no
references): to route by an answer, use a branch per value. Codebook
validation checks both.

**The client chooses the branch.** When it enters a loop, the client
evaluates the branches in order, takes the first that matches, and asks
`GET /loop/:loop/next?branch=<i>`. The runtime checks that the branch
exists, takes its set (the branch's own, or in `assign` mode drawn or named
by a session value), checks that it exists, and stores it. A loop with a
single unconditional branch routes without the parameter; any other loop
answers 409 `branch_required` until the client chooses. This way the server never needs the answers a branch
depends on, which is what end-to-end encryption needs (`plans/encryption.md`,
"Routing on answers").

*Trust trade-off.* A coder can choose their own branch, by sending another
branch index. The server only guarantees that a coder gets units of a
branch the codebook could route *someone* to. Routing by `when` is a
convenience for the researcher, not access control; the set in `assign`
mode is decided by the server. `auto` assignment (random, balanced) and
`$session` values themselves stay on the server, so a coder can't change
their stored group; only which branch they ask for.

**Routing is sticky.** The coder's set is stored per coder by the
branch's fingerprint (`branchFingerprint`: a hash of its mode, its set or
group, and where an assigned set comes from), with when (`assignments`,
e.g. `{ "assign-1k3x9": { set: "parts/s2", at: … } }`), and later choices
are ignored. A coder who later changes an answer used in `when` keeps their
units, as long as the codebook still has a branch with that
fingerprint. So relabelling, moving or reordering loops moves nobody;
changing which units a branch hands out routes its coders again. Two loops
whose branches hand out the same units share the routing (the same set in
both).

**Loops have no name.** Within one codebook version a loop is identified by
its position (`unitLoops`: `"1"`, `"2"`, ...): the coder API's
`/loop/:loop/...`, progress per loop, and the runtime's queues and leases.
All of that is rebuilt when a version is published. Answers and "finished"
don't depend on it either: they are keyed by the loop's questions (§8.2).
The optional `label` is for people: the editor, progress and exports.

The example "1000 units, until 5 coders agree, max 100 per coder" is:

```yaml
order: random
units:
  - { mode: shared, until: { agree: 5, on: sentiment }, maxCoders: 10, maxUnits: 100 }
```

### 6.2 Sets are explicit

Sets are stored lists, not recipes. That way adding units to a job never
changes an existing distribution. Units belong to named sets within **set
groups** (`unit_sets (job_id, grp, set_name, unit_id, position)`): a group
is like a column of the units, each unit's cell naming its set(s) (`s1`,
`s1;s2`, `s1#3` with a position). A CSV upload can have such a column
(type **sets**). `_overlap` is reserved: the group's overlap units. Sets
are not part of a unit's data, so moving a unit is no new unit version.
The researcher UI's "Split units into sets" makes a group (in the client,
then stored with `PUT /job/:jobId/sets/:group`):

- shuffle the units with a seed;
- set aside an overlap (a number or a fraction) as `_overlap`;
- split the rest into `s1..sN`.

The splitting logic is a pure function, `splitIntoSets` in contracts
(`sets.ts`).

## 7. Coder variables, session parameters and links

**`auto` variables** are assigned, never asked, and never changed afterwards.
The client skips them as steps.

- `random`: weighted draw from `options` (server).
- `balanced`: the option fewest coders have so far (server), e.g. to
  spread coders over experimental groups. (To spread coders over sets of
  units, use a loop in `assign` mode.) Counted in the database, under a lock
  per variable (§3).

Values from the link or URL are session parameters, not `auto` variables
(below).

The server refuses to let the client overwrite assigned variables.
`POST /variables/coder` keeps the stored values.

**Frozen answers.** A coder-level answer a unit loop depends on (the loop's
layout, questions, conditions or branches refer to it: contracts
`loopDependencies`) is frozen once the coder coded a unit in that loop:
changing it would change what those units were coded with.
`annotation_values.frozen` is set when a unit is submitted; later values
for it are ignored, and the coding screen shows it read-only (`frozen` in
the session).

**Session parameters.** The codebook's **Session** item (`type:
"session"`, at most one, always first) declares what a link carries and
what may be added to it:

```yaml
type: session
params:
  - { name: part, kind: link, values: { sets: parts } }          # a link per set of group parts
  - { name: study, kind: url, param: STUDY_ID, values: { open: { pattern: "[0-9a-f]{24}" } } }
participant: { param: PROLIFIC_PID }                               # the participant id from the URL
combinations: [...]                                                # optional: only these link combinations
```

- **Link parameters** (`kind: "link"`) are fixed in the link; values are a
  `list` (`{ value, label? }`) or the sets of a group (`{ sets: group }`).
- **URL parameters** (`kind: "url"`) are added to a link by whoever shares
  it: URL key `param` (default the name), required unless they have a
  `default`, values a `list`, the sets of a group, or `open` (optional
  `pattern`). At most 256 characters. A missing required value is 400
  `url_param_missing`, one that doesn't fit 400 `url_param_invalid`.

All are `$session.<name>`, stored on the coder when the session starts.
Built in: `$session.participant`, `$session.source` (an optional
`?source=` on any link) and `$session.email` (the login's email).

**Links** (invites; stored on the server, never in the codebook) are made
by publishing: one per combination of link parameter values (one if there
are none; above 500 publishing needs `confirmLinks`, at most 2000), keyed by
their values so a link keeps its secret across versions. Set changes sync
them too. A combination no longer made is **retired** (403 `link_inactive`
for new coders; coders who started keep working), never deleted. The
researcher sets only who may use a link:

```json
{ "label": "Alice", "auth": "required", "emails": ["alice@uni.nl"], "maxUses": 1 }
```

- **Routing a specific coder.** A link per set (a link parameter with
  `values: { sets: parts }` and an `assign` loop `from: { session: "part" }`)
  gives that link's coders its set, and the codebook never learns who they
  are.
- **Enforcement.** `maxUses` is enforced; links that require login, or
  list email addresses, take only those logins. Participant ids and login:
  `docs/coder-identity.md`.

## 8. Resuming, and codebook updates

### 8.1 Resuming a session (implemented)

When a coder reopens a session (reload, transfer, next day), the client
continues where they left off:

- **Top-level questions** that already have an answer that fits the current
  codebook are skipped. They stay reachable by navigating back.
- **Unit loops.** `GET /session` returns, per loop, the finished unit ids
  in order and `totalUnits` (their set plus the overlap, or in a shared
  queue `maxUnits` plus the overlap; `null` when it depends on other coders). The client rebuilds the loop's history from those ids,
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
| Option values changed (an answer's value removed) | stay finished; the answer is dropped from view and asked again if the coder navigates back and resubmits | asked again |
| Question renamed | = removed + added | = removed + added |
| Conditions / order changed | stay finished | follow the new codebook |
| Distribution changed | routing kept if a branch with the same fingerprint still exists, else re-routed (§6.1) | new rules apply |

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
  written with. Finished codings are rows of `unit_codings`, written with
  the answers (the runtime decides which loops a submit finishes, §3);
  `listFinished` (a query by the loop's variable names) derives them again
  when the codebook or the annotation epoch changes. Finished units are
  tracked per loop, so a unit in two loops is finished in each separately.
- **Order** in a coder's progress is when they first finished the unit
  (`unit_codings.created`), so editing a finished unit doesn't move it.
- **Adding a question to a loop reopens its finished units** (they lack the
  new answer). Coders get them back first, with their earlier answers, and
  answer only what's new. Deploying such a codebook returns a warning with
  the number of affected codings.
- **Reset** (`POST /job/:jobId/annotations/reset { variables, unitIds?,
  coderIds? }`, a researcher action): retires live values instead of
  deleting them. The units are unfinished again; the old values stay for
  analysis. It bumps the deployment's `annotationEpoch`, so the runtime
  reloads.

### 8.4 Unit versions: what coders saw

Coders get only the unit fields the codebook uses (`shownUnitFields`:
`$unit` references in loop layouts, question texts, conditions and end
messages, span fields), which keeps other columns
(e.g. metadata) from coders and responses small. A unit as shown, its
external id and those fields, is a **unit version**: a row of
`unit_versions` (`id`, `unit_id`, a `hash` of the shown content, the
`data`), stored the first time it is shown. Every answer points to the
version its coder saw (`annotation_values.unit_version_id`), and to the
codebook version it was given under (`codebook_id`); both are foreign
keys.

- Each serve computes the shown data and its hash and looks up the version
  (`unit_versions`, inserted only the first time it is shown);
  `unit_serves` records the version last shown to the coder, which is
  stored with their answers.
- A unit can be replaced after it was coded, with a warning
  (`overwriteCoded` on `POST /units`): later coders see the new
  content, a new version; earlier answers keep theirs. So it is visible
  which answers are about which content, and spans can always be read
  against the text they were made on.
- Editing a field the codebook doesn't use makes no new version; a
  codebook that starts using another field does (coders then see more).
- Units with answers can't be deleted (their answers would lose them).

### 8.3 Open: choosing what reopens

With "finished = all current questions answered", adding a question always
reopens finished units, and a reset reopens chosen units explicitly. Still
open: letting the researcher add a question *without* reopening, e.g. by
naming the variables that define "finished" per loop (default: all). Hold
off until a real case asks for it.

Other open points:

- `totalUnits` is unknown in a shared queue without `maxUnits`; the client
  then counts the units seen so far.

## 9. Code map

| Where | What |
| --- | --- |
| `contracts/src/codebook/unitLoop.ts` | `unit_loop` branches: modes, overlap, `when`, set references |
| `contracts/src/codebook/session.ts` | The Session item: link and URL parameters, combinations |
| `contracts/src/codebook/references.ts`, `condition.ts` | `$unit`/`$var` references, template parsing, scopes; conditions (scripts), helper methods, simple conditions |
| `contracts/src/sets.ts` | Set groups and sets, set columns, `splitIntoSets` |
| `contracts/src/deployment.ts` | Deployment, reset, status and preview schemas (researcher API) |
| `contracts/src/endpoints/` | The two API registries: researcher, coder ([docs/api](api/README.md)) |
| `server/src/app.ts` | Hono app: researcher API (`/job`, `/me`, `/auth`), admin API (`/admin`), coder API (`/d/<deploymentId>`), `/health`, and the built client (`ANNOTINDER_CLIENT_DIR`) |
| `server/src/coder.ts` | The coder API routes: session cookie, coder resolution, units, answers, transfers |
| `server/src/researcher/` | The researcher API, one file per path; `auth.ts` (sessions, API keys, dev headers), `login.ts` (`/auth/...`) |
| `server/src/oidc.ts`, `shared/accounts.ts`, `shared/sessions.ts` | Researcher login with an OpenID Connect provider, users and API keys, sessions |
| `server/src/shared/` | Database queries shared by both APIs (deployments, finished units, units, coders, ...) |
| `server/migrations/`, `src/db.ts` | The data model (numbered SQL migrations) and the database (`Sql`: `pg` or PGlite) |
| `server/src/runtime/registry.ts` | `Deployments`: lazily loads one runtime per deployment; failures aren't cached; revision bumps, status, preview tokens |
| `server/src/runtime/runtime.ts` | `DeploymentRuntime`: spec, routing, distribution under locks, auto variables, status |
| `server/src/runtime/store.ts` | `Store`: what the runtime reads and writes; `DbStore` on the database |
| `server/src/runtime/types.ts` | The runtime's internal types (spec, coder, annotations, finished rows) |
| `server/src/runtime/session.ts` | Coder session cookies, CSRF header |
| `server/src/runtime/preview.ts` | Researcher previews: preview tokens, `PreviewStore` with in-memory coders and answers |
| `server/src/runtime/distribution.ts` | `UnitPool` (fixed, or a shared queue), `pickNext` (own units and overlap), `Codings` |
| `server/src/runtime/codebook.ts` | Loop/variable lookup, annotation validation, agreement keys |
| `client/.../admin/UnitLoopForm.tsx` | Editor for loop branches, modes and overlap |

Tests (`server/src/__tests__/`) run through the app's fetch handler on
PGlite (or a Postgres server with `TEST_DATABASE_URL`): `coder.test.ts`
runs coders end to end (a new app on the same database is a restart),
`app.test.ts` the researcher API and the store's queries,
`researcherApi.test.ts` the API as a script uses it (responses checked
against the contract schemas), `login.test.ts` login against a mock
provider.

## 10. Open questions and next steps

Roughly in order:

1. **Several server processes.** Built for it (§3), not run that way yet.
   Previews keep their coders and answers in one process's memory
   (`preview.ts`): with several processes a preview needs them in the
   database (marked as preview data, deleted when it expires), or its
   requests routed to one process. A job's limit on answers is counted per
   process between reads (once a minute), so a job can pass it by a little.
   Rough load for a large crowd job (1000 coders at once, a unit every 20 s,
   batches of 5): ~50 submits, ~10 locked picks and ~60 coder lookups per
   second, well within one modest Postgres; size the connection pools so
   all processes together stay under `max_connections`.
2. **Publishing follow-ups.**
   - A dry run of a publish, so the reopen warnings (§8.2) show before
     confirming instead of after.
   - Choosing what reopens after a codebook update (§8.3).
3. **Local coding from R and Python** (`compositions.md`): R or Python runs
   the runtime (V8) and serves the coder API; then the R and Python
   packages. (Not a standalone local app or binaries: see "Not planned"
   there.)
4. **Researcher API follow-ups.** A webhook that posts new annotations;
   per coder whether they are done
   (only the runtime knows how many units a coder gets); changing a unit
   field's type.
5. **Limits.** Quotas per account are built (`accounts.md`: plans, domain
   groups, per-user overrides, unit and answer sizes). Still open: rate
   limits, and storage in bytes.
6. **Unit preprocessing.** Unit versions (§8.4) hold the fields as shown;
   preprocessing (e.g. tokenizing once on the server) would be part of it.
7. **Keeping history.** Unit versions are kept (§8.4). Answers reset by a
   researcher are kept as retired rows; a coder changing an answer updates
   it in place (decided: no history of a coder's own edits for now; adding
   it later is a new table, not a change to this one).
8. **Sessions.** For researchers: a list of active sessions, logging out
   everywhere, logging out at the provider.
9. **Multimedia.** Images, audio and video in units should probably **not**
   flow through the JSON path. Proposal: units reference media by id; the
   server returns short-lived signed URLs to a blob store. This keeps the
   runtime's memory JSON-only.
10. **Semantic validation.** Validation checks variable names, option
    values, items, and the arguments of helpers in simple conditions. Running codebook conditions (QuickJS)
    server-side, to reject answers to questions the coder should never
    have seen, would be the next step. Conditions and branch choice run on
    the client today (§6.1), which keeps client-side encryption of answers
    possible (`plans/encryption.md`).
11. **Scale.** A pick from a shared queue reads the loop's finished codings
    and leases (bounded by units x `maxCoders`), under the queue's lock
    (taken in turn within a process before a connection is used, so
    waiting picks don't hold the pool). Measured (`hosting.md` "Capacity"):
    with 10k units and ~12k codings a pick takes ~40 ms, most of it reading
    the codings, so one queue serves ~25 picks per second. For very large
    queues, a per-unit summary kept up to date on submit (codings,
    agreement, full) would let Postgres return only candidates.
    Researcher status is computed on demand: fine for occasional use;
    aggregates kept in the database if it gets polled.
12. **Admin unit cache.** A client-side cache of units for the researcher
    UI (IndexedDB), compared by ids and hashes.

13. **Planned, not built** (`plans/`): gold checks, question loops, example
    jobs, passkeys as a second layer with a login shared with AmCAT, and
    (on hold) encrypting answers in the browser.

Smaller things worth an issue: a swipe-card UI for the `annotinder` answer
type; `VariableValue` as a discriminated union; a live preview of a
codebook item while editing it. Client gaps: `client.md` §9.
