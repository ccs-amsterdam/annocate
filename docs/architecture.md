# Server architecture

One server, `packages/server`, on Postgres: `pg` against a Postgres server in
production, PGlite (Postgres in WebAssembly, in process) in development and
tests. How server and client combine into products: `compositions.md`.

## 1. Why a server with logic

Two things can't live in the client:

- **Distributing units over coders** ("code each unit until 5 coders agree,
  at most 100 units per coder") needs a live, shared queue.
- **Validating answers**: the client can't be trusted.

So the server runs the study: distribution, validation, sessions. Other
systems (AmCAT, R, Python) don't run a server of their own; they use the
researcher API to push units and designs and to download answers.

## 2. Roles

```
      researcher, R, Python, AmCAT                   coder
                │ researcher API                       │ coder API
                ▼ /study/...                           ▼ /d/<deploymentId>/...
 ┌─────────────────────────────────────────────────────────────────────┐
 │ server (packages/server)                                            │
 │  researcher API: studies, designs, units, sets, links,              │
 │    deployment, progress, results                                    │
 │  runtime (per deployment): distribution, leases, validation;        │
 │    state in the database, only the deployment spec in memory        │
 │  database: the source of truth                                      │
 └─────────────────────────────────────────────────────────────────────┘
```

The APIs ([docs/api/](api/README.md)), all under `/api`:

- **Researcher API** (`researcherEndpoints`, [spec](api/researcher.md)):
  `/study/...`, `/me`, `/auth/...`. Used by the researcher UI (session cookie)
  and by scripts and other systems (API keys). Login: `coder-identity.md` §7.
- **Coder API** (`coderEndpoints`, [spec](api/coder.md)):
  `/d/<deploymentId>/...`, used by the coding screen. The deployment id is the
  study's public id (`studies.public_id`: random, so coder links don't show
  how many studies there are), or `<publicId>.preview` for a preview. No CORS: the session is an
  httpOnly cookie on the client's origin.
- **Admin API** ([spec](api/admin.md)): `/admin/...`, server settings and accounts.

**The runtime** (`src/runtime/`) runs a deployed study. It resolves coder
sessions, decides which units a coder gets next (following the coder
invitation and the unit loops), validates answers and writes them. It reads
and writes through a `Store` (`store.ts`): `DbStore` (`dbStore.ts`) for the
database, `PreviewStore` (`preview.ts`) for previews. `DeploymentRuntime`
(`runtime.ts`) is the facade; what it does is in a module each (§10).

**The client**: the researcher UI (`ResearcherApi`) calls the researcher
API; the coding screen (`HttpCoderApi`, `StudyManager`) the coder API. Client
and server share an origin; in development Vite proxies `/api`.

## 3. Invariants

1. **Stored before acknowledged.** An answer is in the database before the
   coder is told it was saved. No buffering.
2. **The database holds the state.** Per request the runtime reads what it
   needs: the coder session (one indexed query by device key), answers,
   units and unit versions shown, finished codings (`unit_codings`), leases
   (`unit_leases`), transfer links. In memory it keeps only the deployment
   spec, re-read when the deployment's stamp changes (version, annotation
   epoch, `revision`, suspension; one small query per request). So any number
   of server processes can serve one study (§11 has what is left).

   **Loaded runtimes are bounded** (`Deployments`, `runtime/registry.ts`). A
   coder request loads a study's runtime only if it belongs there
   (`Deployments.admit`): it shows a link of the study, a device with a
   session in it, a transfer token of it, or a login whose email has a
   session in it, each one indexed lookup. Anything else gets one 404
   (`api/coder.md`) and loads nothing, so trying ids doesn't fill the
   server's memory. A process keeps at most 200 runtimes
   (`maxDeployments`; studies and previews): past that the one used longest
   ago is dropped, as is any unused for 6 hours (`deploymentIdleMs`).
   Dropping loses nothing: the next request that belongs loads it again
   from the database.
3. **Decisions that count other coders run under a lock.** Picking from a
   shared queue (and leasing the unit) and drawing a `balanced` value run in
   one transaction holding a database lock on that queue or variable
   (`Store.locked`, `pg_advisory_xact_lock`), so two coders never get the
   same slot. Starting a session does too: a lock per device key (of two
   first requests of one device at once, the second finds the session the
   first made), per coder id (the count for the most sessions of a coder
   id, `coder-identity.md` §4) and per picked name. The locks are in one
   file, `db/locks.ts`: `advisoryLock` (a database lock on a text key, until
   the transaction ends), `lockUnits` (a study's unit writes and deploys
   against answer writes), `inTurn` (a line per key within one process, so
   requests waiting for a database lock don't hold the connection pool) and
   the lock under which a starting server applies the migrations.
4. **Finished codings are derived and kept in step.** A unit is finished in
   a loop when the coder answered every question of it (§8.2).
   `unit_codings` has a row per finished (loop, unit, coder session), with
   the answers to the loop's agreement questions, written with the answers.
   When what finishes a loop changes (a redeploy with other loop positions or
   questions: `codingsSignature`) or answers are reset (`annotationEpoch`),
   they are derived from the answers again, once (`deployments.codings_basis`;
   the first process to get the lock does it). They are written 5,000 rows
   per insert, in a transaction without the database's time limits (a
   statement or an idle transaction otherwise ends after 60 seconds): in a
   large study this is long by nature.

Previews are the exception: coders and answers live in one process's memory
(`preview.ts`).

## 4. Trust and hosting

The server sees units and answers in plaintext, like any web application.
Where it runs is the researcher's choice: a server someone else runs, or
their own institution's for sensitive data. Who runs a server and where it
is hosted is for that server to state, on its own information page (release
plan, P-A3), not for these docs. Encrypting answers in the browser
is a possible later hardening (`plans/encryption.md`).

## 5. Lifecycle

**Deploy.** `PUT /study/:studyId/deployment` with
`{ designVersionId, units, active }` deploys a design version, with the draft
units and sets (new unit versions, §8.4) or the deployed ones. The server
bumps the deployment `version` when either changed and freezes the design
version. Other changes runtimes must see (study settings, resets) bump
`deployments.revision`. Coders' browsers send the version their codebook
belongs to; an older one gets 409 `design_changed` and the client reloads
the session (`api/coder.md`).

**Links** are made by deploying: one, or one per coder of the units'
`coder_set` (§7). They open the client with the deployment id and the link's
secret.

**A coder session:**

1. **First request.** The runtime finds the session by device key (a hash of
   the device cookie's id, the deployment and a crowd's coder id:
   `coder-identity.md` §4) or creates it from the link secret, storing its
   coder and `$session` values (URL parameters, `source`, the coder; §6.1,
   §7; `runtime/sessionValues.ts`).
2. **`GET /session`** returns the coder codebook (the coders' view of the
   design), per-loop progress and the coder's variables (so client-side
   conditions can use drawn values).
3. **`GET /loop/:loop/next?count=k`** works out the coder's units from their
   session values (§6), drawing the condition of an experiment that selects units if the loop needs it,
   and marks the loop as reached (`coder_sessions.assignments`, for
   progress). It picks the next k units (unfinished first); in a shared queue
   it leases them; it records the versions shown (`unit_serves`). The client
   asks for 5 and again before it runs out.
4. **`POST /variables/unit`** checks the unit was assigned to this coder,
   validates the answers and writes them, with the codings they finish. The
   client posts in the background, one at a time, in order
   (`StudyManager.save`); the coder goes on at once.

**Preview.** `POST /study/:studyId/deployment/preview` returns deployment id
`<publicId>.preview` and a token signed with `ANNOTINDER_SECRET` (random per
process if unset, so previews end at a restart). The runtime runs the latest
design version (checked on every request, so edits show at once) with the
real units, but keeps coders and answers in memory: a preview stores nothing.

**Status.** `GET /study/:studyId/deployment/status`: units complete, started
and leased; codings and coders (`runtime/status.ts`). One row per loop and
set. Coders with the same share have the same units, so a share's units are
counted once, however many coders have it; a unit in several shares is
listed in the first row that has it.

## 6. Distribution: the design describes the process

**Principle: the design names parameters but never binds them.** A design is
meant to be shared and reproduced, so it says *how* units are distributed,
never which unit ids or which people.

| Layer | Contains | Reproducible? |
| --- | --- | --- |
| Design | questions, experiments, branches (items only some coders get: a condition, optionally a label and else items; end items only in a branch), unit loops (optionally a condition; a part, placements of test units, checks, a crowd's distribution criteria), the session (who codes, URL parameters, the normal end). Refers to role columns' values (a part, conditions) by name, to coders only via `$session` values | yes |
| Role columns | the units' `coder_set`, `condition_set`, `part_set` and `test_set`: per value, its units in order | data |
| Links | made from the who codes (one, or one per coder of `coder_set`), with their secrets and uses | no (server only) |

**Role columns** (`docs/plans/unit-sets.md`, contracts `sets.ts`). Four unit
columns have a fixed name and meaning; any other column is data:

| Column | Values | Used by |
| --- | --- | --- |
| `coder_set` | coder names or email addresses (`anna;bob`: several) | expert coders: who codes the unit |
| `condition_set` | an experiment's conditions (several per unit) | the experiment that selects units |
| `part_set` | parts of the study, e.g. `pre`, `post` (several per unit) | a loop shows one part |
| `test_set` | one of `overlap`, `practice`, `gold`, or empty (a coding unit) | where loops place test units, and their checks |

Right answers of practice and gold units are in the unit columns
`answer_<q>` (and practice feedback in `feedback_<q>`), one per question
`q` (§6.2).

One idea, *who is this session for*, decides a session's units: its coder
(`coder_set`, expert coders) and the condition of the experiment that
selects units (`condition_set`). Loops only select (a part) and place units
within those, and for a crowd divide them. "Three links for my three
coders, with some overlap" is then one setting and two columns
(`coder_set`, and `test_set` with a few `overlap` units).

### 6.1 A session's units

Decided per session, for the whole study (contracts `design/session.ts`,
`shareOf` in the runtime). The who codes (`session.invite`) says who
codes:

```yaml
session:
  invite: { mode: coders, link: per_coder }   # or login, pick_name
```

```yaml
session:
  invite:
    mode: crowd                                   # "One link"; the default: { mode: crowd }
    coderParam: { param: PROLIFIC_PID, pattern: "[0-9a-f]{24}" }   # optional: the coder id
    login: true                                   # optional: coders must sign in
    maxCoders: 200                                # optional: the link's sample size
```

**Expert coders** (`mode: "coders"`): the values of the units'
`coder_set` are the coders; a session gets its coder's units plus the test
units. Until the units have a `coder_set` there are no coders: the draft
saves, deploying can't.

| `link` | How coders get in |
| --- | --- |
| `per_coder` | a link per coder; the link's coder (`links.params.coder`) is the session's. A link whose coder left `coder_set`: 403 `link_inactive` |
| `login` | one link, sign-in required; the coder is the login's address (all coders must be email addresses; others get 403 `email_not_allowed`) |
| `pick_name` | one link; coders pick their name (`GET /names`, then `x-coder-name`; 409 `name_required` until they do). `nameDevices: "first"` (default): a name belongs to the first device that picks it (others: 409 `name_taken`); `"any"`: picking a name continues its session. Names are visible to anyone with the link |

**Crowd (one link)** (`mode: "crowd"`, also for surveys and survey experiments): one
link for everyone.

- `coderParam`: the coder id from a URL parameter, required (400
  `url_param_missing` / `url_param_invalid`) unless `optional: true`.
- `login`: coders must sign in (401 `auth_required`); without a `coderParam`
  value the email is the coder id.
- `maxCoders`: the link starts at most this many sessions (contracts
  `linkMaxCoders`).
- Whether units are divided among the coders is each loop's (`divide`,
  §6.2). Without it every coder codes all their units.

**Who the coder is** (`$session.coder`): the expert coder's value, the
`coderParam` value, else the login's email where sign-in is required. A new
device for a coder who already has a session is asked first (409
`coder_has_session`, `coder-identity.md` §4).

**Without a unit loop** the unit settings are kept but unused (validation
warns); links still follow the invitation, e.g. a survey of known experts.

**Experiments** (`type: "experiment"`, §7) assign a condition when reached;
with `selectsUnits: true` they also select units for the loops after it: those
with the condition in `condition_set`. At most one experiment selects units,
and only with one link (validation errors).

A session's units are the units with its coder in `coder_set` (specific
coders) and its condition in `condition_set` (an experiment that selects
units), plus the test units: test units are everyone's, not selected by
`coder_set` or `condition_set`. Without either: all units.

Coders can always sign in (to keep their session across devices);
researchers see emails only where the invitation requires sign-in
(contracts `loginRequired`).

### 6.2 Unit loops

Defined in `contracts/src/design/unitLoop.ts`. A loop has one optional
`units` object (absent: all the session's units, once, test units spread)
and works within the session's units:

```yaml
type: unit_loop
label: News items        # optional: shown in the editor, progress and exports
order: random            # sequential (default, the set's order) | random per coder
units:
  part: post                                   # only the units with this value in part_set
  coding: true                                 # the coding units (default); false: only test units
  overlap: spread                              # ignore | before | after | spread (default)
  practice: before
  gold: spread
  practiceCheck: { questions: [sentiment], retry: true }
  goldCheck: { questions: [sentiment], health: { start: 5, wrong: -1, end: screened_out } }
  divide:                                      # a crowd only: a shared queue
    until: { agree: 2, on: sentiment }         # or codersPerUnit: { min: 1 }
    codersPerUnit: { max: 5 }
    unitsPerCoder: { max: 100 }
```

- **`part`**: only the units with this value in `part_set`, e.g. a pre and
  a post loop. One part per loop; without one, all parts. A test unit with
  a part is only in that part's loops; without one, in every loop.
- **`coding: false`**: only the test units (e.g. a practice round).
- **`sameAsPrevious: true`**: the units each coder finished in the previous
  loop, in that order; fixed when the coder reaches this loop (stored in
  their `assignments`). A third loop with it takes the second's (so the
  first's). Not with `divide`; a coder who skipped the previous loop gets
  none.
- **Without `divide`** every coder codes all their units once.
- **With `divide`** (only for a crowd; validation error otherwise), the
  loop's units are a queue shared by sessions with the same units.
  `effectiveLoopUnits` resolves the loop's settings. `until.on` must be a
  question of the loop.
  - A unit is **done** once `codersPerUnit.min` coders finished it, or
    `until.agree` coders gave the same answer to `until.on` (a single
    categorical question of the loop), or `codersPerUnit.max` coders finished
    it (`max` is required with `until`).
  - `unitsPerCoder.max` caps units per coder (test units aside);
    `unitsPerCoder.min` lets the maximum give way while a coder has fewer.
  - **Open slots** are codings still needed (capped by `codersPerUnit.max`)
    minus active leases. Without open slots a coder gets any unit that isn't
    **full**, least coded first; so a coder gets nothing only when every unit
    is full (`Reach` in `runtime/distribution.ts`).
  - **Leases** last `leaseSeconds` (default 900). Asking "next" while holding
    leases returns the same units, so a reload is safe.
  - **`priority`**: `cover` (default) prefers least-coded units, `saturate`
    units closest to done.

**Test units.** The units' `test_set` (`overlap`, `practice`, `gold`; one
per unit) are placed among the coder's coding units: `ignore`, `before`,
`after`, or `spread` (default). Overlap units are coded by every coder (to
compare coders); practice units give feedback; gold units are checked
silently. Spreading needs the number of units a coder gets; in a shared
queue without `unitsPerCoder.max` it becomes a rate: about one in ten,
seeded per coder, never more than twenty apart (`DEFAULT_RATE`). Positions
(`practice#2`) give practice units an order. `$unit.test_set` is a unit's
test set (null for a coding unit), e.g. for a note on practice units in the
layout: sent when the design uses it, and always with practice units.

- **Answer columns.** For each checked question `q`, the right answer is in
  unit column `answer_<q>`, practice feedback in `feedback_<q>` (optional);
  one column for practice and gold alike (the unit's test type says how it
  is used). Never served to coders: a layout or script that uses
  `$unit.answer_*` or `$unit.feedback_*` is a validation error. Cells
  (contracts `answerKey.ts`): `positive` (exactly), `a;b` (together),
  `positive|neutral` (any of), `3..5` (a range).
- **Practice** (`practiceCheck`) is checked in the browser per question. A
  wrong answer shows the unit's feedback, the loop's `message` or the
  expected answer; the coder retries until right (`retry`, default) or goes
  on. Tries are stored with the answer's timing.
- **Gold** (`goldCheck`) is checked on the server; coders see nothing. With
  `health`, a score starts at `start` and changes by `wrong` and `right`
  (never above `start`); at 0 the session ends at end item `end` (a
  screen-out).

**Nothing to route.** A coder's units follow from their session values,
recomputed per request; nothing about them is stored except which loops a
coder reached (`assignments`, by loop key, `{ "<loop>": { "at": <ms> } }`,
with `units` for a loop taking the previous loop's units).
A coder keeps units they coded in a loop even if their values or the loop's
settings change.

**One `units` per loop.** Groups that need other units differ in session
values, not per-group loop settings (those would duplicate a loop's
questions under the same names). Per-group settings belong with value
branches (`plans/question-loops.md` §5).

**A loop has an id, not a name.** Every `unit_loop` has an `id` (`loop_1`,
`loop_2`, ...): the loop's key (`unitLoops`) in `/loop/:loop/...`, progress,
queues, leases, results and exports, in every version of the design. A new
loop gets the next number never used in the design (`nextLoopId`), so the
number says nothing about the loop's place, and a deleted loop's id is not
given to another loop. Whoever creates the loop gives it the id (the editor
does; a script must too): a loop without one is a validation error, the
server never fills it in. The id is never changed; the optional `label` is
for people. "The previous loop" (`units.sameAsPrevious`) is the loop before
it in the design. Deploying a design without a loop that coders reached
gives a warning. Answers and "finished" are keyed by the loop's questions
(§8.2).

### 6.3 Role columns are stored lists

Sets are stored lists, not recipes, so adding units never changes an
existing distribution. A role column is a unit field (`units.fields`; type
`set`, `test_set` type `test_set`), stored as a set group (`unit_sets`,
`unit_set_members`, draft and `live`). Each unit's cell names its values:
`anna`, `anna;bob`, `anna#3` (with a position); `test_set` one of
`overlap`, `practice`, `gold`. Sets aren't unit data: changing them makes no
new unit version. Only the role columns can be written
(`PUT /study/:studyId/sets/:group`, `group` one of `coder_set`,
`condition_set`, `part_set`, `test_set`); an upload can't give them as
data.

The coder set dialog makes `coder_set` (`distributeUnits`, contracts
`sets.ts`): it shuffles the units with a seed, keeps the existing test
units (or draws a number of each type anew), and divides the rest over the
coders. The Units page's split tooling makes `condition_set` or `part_set`
(`splitIntoSets`).

**Deploy checks** (server `shared/deployChecks.ts`, `assignmentChecks`):

- errors: expert coders without `coder_set` values; sign-in coders
  (`link: "login"`) whose values aren't all email addresses; an experiment
  that selects units without `condition_set`, or with listed conditions it
  has no units for;
- warnings: conditions of `condition_set` the experiment doesn't list; a
  loop's part `part_set` doesn't have; a part no loop shows (when every loop
  has a part); units no coder gets (not test units, and without a coder, a
  condition, or a part a loop shows); loops that check practice or gold
  units without such units, or without right answers (or with answers that
  can never be right).

## 7. Coder variables, URL parameters and links

**Experiments** (`type: "experiment"`, variable type `experiment`) give each
coder one of their conditions: drawn, never asked, never changed. The
condition is drawn when the coder *reaches* the experiment: the client saves
the answers so far, calls `POST /experiment/:name` and goes on with the
condition. Coders screened out before one don't count.

- `draw: "random"`: a weighted draw from `options`.
- `draw: "balanced"`: the condition fewest coders have so far (ties at random),
  under a lock per variable (§3). With `stratify` (earlier coder-level
  questions, `session.<name>` values) balanced within groups.
- `draw: "url_param"`: the value of a URL parameter of the Study entry
  (`param`: its name, i.e. `$session.<param>`), which must list `values`:
  they are the conditions (with `options`, the same values). Nothing is
  drawn; weights and `stratify` don't apply.
- With `selectsUnits: true`, the condition also selects the coder's units in later
  loops: those with it in `condition_set` (`options` optional: then
  `condition_set`'s values). At most one experiment selects units, only with
  one link. Not yet reached when a loop needs it, it is assigned then.

The client can't overwrite drawn values.

**Frozen answers.** A coder-level answer a loop depends on (its layout,
questions or conditions refer to it: contracts `loopDependencies`) is
frozen once the coder coded a unit in that loop
(`annotation_values.frozen`); the coding screen shows it read-only.

**The session.** The design's `session` (the Study entry, edited above the
item tree) holds the who codes (§6.1), the URL parameters, the normal
end and the display settings:

```yaml
session:
  invite: { mode: crowd, coderParam: { param: PROLIFIC_PID } }
  urlParams:
    - { name: study, param: STUDY_ID, pattern: "[0-9a-f]{24}" }
    - { name: wave, values: [{ value: "1" }, { value: "2" }], default: "1" }
  end: { message: "Thank you!", redirectSetting: panel_return }
```

- **`end`**: what coders see after the whole design, and where they are sent
  (`redirectUrl`, or `redirectSetting`: a deployment setting). Coders get it
  as an end item `_end` after the last item (`toCoderItems`; the name is
  reserved). End items in the design are for ending early.
- **URL parameters** (`urlParams`) are added to a link by whoever shares it:
  URL key `param` (default the name), required unless they have a `default`,
  any value, a `pattern` or a list of `values`. A pattern is a regular
  expression the value must match in full (`[0-9a-f]{24}`), matched with RE2
  (`re2js`; contracts `design/urlPattern.ts`), in time linear in the value
  whatever the pattern: the value comes from anyone's link, before any
  login, so a backtracking pattern can't stall the server. RE2 has no
  backreferences (`\1`) and no lookahead (`(?=...)`): a design with such a
  pattern doesn't pass validation ("This pattern is not supported"). A value
  is at most 256 characters. Missing: 400
  `url_param_missing`; not fitting: 400 `url_param_invalid`.

All are `$session.<name>`, stored on the session when it starts. Built in:
`$session.source` (an optional `?source=` on any link) and
`$session.coder`; `coder` and `source` are reserved names. Reserved as keys
in the URL are `source` and the link's own query names `link`, `transfer`
and `login` (contracts `RESERVED_URL_KEYS`): a URL parameter can't have one
as its key (`param`, or its name without one), nor can `coderParam`. The
coding page keeps those three for itself and never sends them to the server
as URL parameters. Experimental conditions come from experiments, never
session values.

**Links** (on the server, never in the design) are made by deploying
(contracts `linkCombinations`): one, or for `link: "per_coder"` one per
coder of `coder_set` (`params: { coder }`; above 500 deploying needs
`confirmLinks`, at most 2000), keyed by their values so a link keeps its
secret across versions. Changes to `coder_set` sync them. A link no longer made is **retired** (403
`link_inactive` for new coders; started coders go on), never deleted. A
revoked link stays revoked through a redeploy until reopened. A link has no
settings of its own: its label is its values (or "Open link"), its
`maxUses` the deployed design's crowd limit. The researcher can only revoke,
reopen or renew its secret.

**Sign-in** is required for expert coders with `link: "login"` and a crowd
with `login: true`; elsewhere it is optional and researchers don't see the
email. Details: `coder-identity.md`.

## 8. Resuming, and design updates

### 8.1 Resuming a session

When a coder comes back (reload, transfer, next day) the client continues
where they left off:

- **Questions outside loops** with an answer that fits the current design are
  skipped (still reachable by going back).
- **Unit loops.** `GET /session` returns per loop the finished unit ids in
  order and `totalUnits` (`null` when it depends on other coders). The client
  rebuilds the loop's history from them ("unit 31 of 100") and loads units
  only when the coder navigates to them (`GET /loop/:loop/units/:unitId`,
  which serves only units the coder has answers for or holds). New units come
  from `GET /loop/:loop/next`.
- **The unit at the frontier** opens at its first question without a valid
  answer (after a mid-unit reload, or a design update that added a question).

Finished units are tracked by id, not position: positions shift when
distribution is dynamic.

**Changing a finished unit.** A coder who goes back to a finished unit and
changes an answer (or a comment) has the unit saved again at once, not only
when its last question is answered again: coders often change one answer
and leave. A question the change now shows is saved as skipped until it is
answered.

### 8.2 What happens when the design changes

Answers are keyed by question name and always checked against the
**current** design (`validateAnswer`, shared via contracts):

| Change | Units already finished | Unit in progress, new units |
| --- | --- | --- |
| Question added | reopened: only the new question to answer (warning on deploy) | asked |
| Question removed | old answers kept, not shown | not asked |
| Option value removed | stay finished; the answer is asked again if the coder goes back and resubmits | asked again |
| Question renamed | = removed + added | = removed + added |
| Conditions / order changed | stay finished | follow the new design |
| Distribution changed | units follow the new settings; coded units stay the coder's (§6.2) | new rules |

How:

- **Answers are stored per (unit, coder session, variable)** with `created`,
  `updated`, `designVersionId` and `retiredAt`. Only live rows (no
  `retiredAt`) count and must be unique. Writes upsert per variable, so
  answers to removed questions are never overwritten.
- **"Finished" is computed from the current design**: every question of the
  loop has a live value (hidden questions are stored as `skip`). Finished
  codings are rows of `unit_codings`, rederived by `listFinished` when the
  design or annotation epoch changes. A unit in two loops is finished in each
  separately.
- **Order** in progress is when the unit was first finished
  (`unit_codings.created`).
- **Adding a question to a loop reopens its finished units.** Coders get them
  back first, with earlier answers. The deploy returns a warning with the
  number of affected codings.
- **Reset** (`POST /study/:studyId/annotations/reset { variables, unitIds?,
  sessionIds? }`) retires live values instead of deleting them and bumps
  `annotationEpoch`.

### 8.3 Choosing what reopens (open)

Adding a question always reopens finished units. Still open: adding a
question *without* reopening (e.g. naming the variables that define
"finished" per loop). Wait for a real case. Also: `totalUnits` is unknown in
a shared queue without `unitsPerCoder.max`; the client counts units seen.

### 8.4 Units: drafts, versions and fields

Everything is a draft until deployed: the design, the units and the set
columns. A preview runs the draft; a deploy makes it live. The design
declares its unit fields (`units.fields`: name and type, e.g. `text`,
`image`, `set`); uploads are checked against them, and deploying checks every
field the design uses exists.

- **Values** (`unit_values`): each field value once per study, by content
  (sha256). Field names are numbered per study (`unit_field_names`).
- **The draft** (`unit_draft`): each unit's working copy, overwritten freely;
  `units.in_draft` says whether a unit is in it. Uploads, deletes and set
  changes only change the draft.
- **Versions** (`unit_versions`, `unit_version_fields`) are made only by
  deploys: a deploy that changes a unit closes its version (`to_deploy`) and
  opens a new one (`from_deploy`). A replaced version no answer points to is
  deleted, as are unreferenced values: only coded content is kept.
  `deployment_versions` records what each deploy changed.
- **Sets** (`unit_sets`, `unit_set_members`): the draft's and the deployed
  (`live`) ones. No history.
- **What coders get**: the current versions, with only the fields the
  codebook uses (`shownUnitFields`; metadata and answer columns stay on the
  server). Every answer points to the unit version its coder saw
  (`annotation_values.unit_version_id`) and its design version.
- **Replacing a coded unit** needs `overwriteCoded`: a new version at the next
  deploy; earlier answers keep theirs, so spans always match their text. A
  unit with versions or answers is never deleted, only taken out of the draft.

## 9. The database

Postgres through [Drizzle](https://orm.drizzle.team). One `Db` type is the
database or a transaction, so functions also run inside a caller's
transaction.

- **Schema**: TypeScript, one file per area in `server/src/db/schema/`
  (accounts and settings; studies, design versions, deployments, links;
  units; coder sessions, devices, answers; distribution; logs and rate
  limits). camelCase in code, snake_case in the database.
- **Migrations** are generated from the schema
  (`pnpm --filter @annotinder/server db:generate`) into `server/migrations/`
  and applied when the database is opened (on Postgres under an advisory
  lock). `0001_seed.sql` is hand-written: `rate_limits` unlogged, the default
  plan and the settings row.
- **Queries** use the query builder; a few are `sql` templates (comparing
  draft and deployed units in `shared/units.ts`, bulk inserts with `unnest`,
  advisory locks). Long id lists go as one array parameter (`anyOf`).
- **SQL expressions** shared by queries are TypeScript functions in
  `db/sql.ts`, not database functions: role resolution (`roleApplies`,
  `accountRole`, `studyRole`) and unit data and hashes (`unitDraftData`,
  `unitVersionData`, `unitDataHash`, `unitValueHash`).

## 10. Code map

| Where | What |
| --- | --- |
| `contracts/src/design/unitLoop.ts` | a loop's `units`: part, placements of test units, practice and gold checks, distribution criteria, `sameAsPrevious` |
| `contracts/src/design/session.ts` | the Study entry: who codes, URL parameters, normal end, display |
| `contracts/src/design/references.ts`, `condition.ts` | `$unit`/`$var`/`$session` references, templates, conditions, helpers |
| `contracts/src/sets.ts` | role columns (`coder_set`, `condition_set`, `part_set`, `test_set`), `distributeUnits`, `splitIntoSets` |
| `contracts/src/deployment.ts` | deployment, reset, status and preview schemas |
| `contracts/src/endpoints/` | the API registries ([docs/api](api/README.md)) |
| `server/src/app.ts` | the Hono app: all APIs under `/api`, the error response, `/api/health` and `/api/ready`, plus the built client (`ANNOTINDER_CLIENT_DIR`) |
| `server/src/config.ts`, `index.ts` | the settings, read and checked at start (the server doesn't start on settings that only fit development); the Node entry point |
| `server/src/coder.ts` | coder API routes: units, answers, transfers, the summary and names; each session route gets its runtime and coder from `runtime/requestCoder.ts` |
| `server/src/researcher/` | researcher API, one file per path; `auth.ts`, `login.ts`; the admin API in `admin.ts` with a file per section (`admin.*.ts`) |
| `server/src/oidc.ts`, `shared/accounts.ts`, `shared/sessions.ts` | researcher login, users and API keys, sessions |
| `server/src/shared/` | queries shared by the APIs; `results/` (the results summaries), `deployChecks.ts` (a design against the role columns) |
| `server/src/shared/request.ts`, `http.ts` | reading a request (`parseJson`, `parseQuery`, `idParam`) and the one error shape |
| `server/src/shared/bodyLimit.ts`, `rateLimit.ts`, `clientAddress.ts`, `requestLog.ts` | body sizes per route, rate limits, whose address a request is from, the request log and request ids |
| `server/src/db/` | `schema/`, `index.ts` (open and migrate), `sql.ts`, `locks.ts` (every lock: `advisoryLock`, `lockUnits`, `inTurn`, the migration lock) |
| `server/src/shared/annotations.ts` | writing a unit's answers with the codings they finish (`putAnnotation`); `insertCodings` (codings in batches) |
| `server/src/runtime/registry.ts` | `Deployments`: one runtime per deployment, loaded for requests that belong there (`admit`), at most 200 (the least recently used goes); revisions, status, preview tokens |
| `server/src/runtime/requestCoder.ts` | a coder request, step by step: its runtime (`loadRuntime`, `proofOf`), the version guard, its coder (`resolveRequestCoder`); counts new sessions per address |
| `server/src/runtime/session.ts` | the device cookie, device keys, the CSRF header, the one 404 (`nothingHere`) |
| `server/src/runtime/runtime.ts` | `DeploymentRuntime`, the facade: loading and refreshing the deployment, keeping codings in step, and one-line methods for what the modules below do |
| `server/src/runtime/deployed.ts` | `Deployed`: the deployment as read (the spec and what is looked up in it per request); `RuntimeOptions` |
| `server/src/runtime/startSession.ts`, `sessionValues.ts` | a device's session, or a new one from its link (login, pick a name, the link's uses, at most 5 sessions per coder id); a new session's `$session` values |
| `server/src/runtime/shares.ts` | which units are a coder's in a loop (`Share`, `Route`, `shareOf`): pure lookups in the sets |
| `server/src/runtime/picking.ts` | a coder's next units; in a shared queue under its lock, for every request waiting |
| `server/src/runtime/submit.ts` | answers coming in: validation, the unit version seen, gold checks; coder-level answers |
| `server/src/runtime/coderUnit.ts` | a unit as a coder gets it (practice checks, `$unit.test_set`) |
| `server/src/runtime/experiments.ts` | an experiment's condition: fixed, random, or balanced under a lock |
| `server/src/runtime/sessionView.ts`, `sessionEnd.ts`, `transfers.ts` | the session as the client loads it (new units); ending, reopening and quitting; "continue on another device" tokens |
| `server/src/runtime/status.ts` | a study's progress for its researchers |
| `server/src/runtime/store.ts`, `dbStore.ts`, `types.ts` | `Store` (what the runtime reads and writes), `DbStore` (in the database), and the types they share |
| `server/src/runtime/preview.ts` | previews: tokens, `PreviewStore` in memory |
| `server/src/runtime/distribution.ts` | `UnitPool` (fixed or shared queue), `pickNext`, `Codings` |
| `server/src/runtime/designItems.ts` | loop and variable lookup, answer validation, agreement keys |

Tests (`server/src/__tests__/`) run through the app's fetch handler on
PGlite (or Postgres with `TEST_DATABASE_URL`). The `coder.*.test.ts` files
run coders end to end, a file per subject (`coder.flow`, `.sessions`,
`.sharedQueues`, `.expertCoders`, `.experiments`, `.testUnits`,
`.designUpdates`, `.redeploy`, `.unitVersions`, `.endItems`, `.preview`,
`.deployChecks`); what they share is in `coderHarness.ts` (the app on the
seeded demo study, coders as devices with cookies, deploying a design, a
restart, a record of the `Store` calls). `app.test.ts` runs the researcher
API, `researcherApi.test.ts` the API as a script uses it (checked against
the contract schemas), `login.test.ts` login against a mock provider. The
`*.pg.test.ts` files need a real Postgres and are skipped without
`TEST_DATABASE_URL` (`pnpm test:pg`, `packages/server/README.md`):
`concurrency.pg.test.ts` (locks and counters under parallel requests),
`coderHome.pg.test.ts` (the coder home's query plan), `pool.pg.test.ts`
(the connection pool).

## 11. Open questions and next steps

1. **Several server processes.** Built for it (§3), not run that way yet.
   Previews live in one process's memory, and a study's answer limit is
   counted per process (read once a minute). Rough load for 1000 coders at
   once (a unit per 20 s, batches of 5): ~50 submits, ~10 locked picks and
   ~60 session lookups per second, fine for one modest Postgres; keep all
   pools together under `max_connections`.
2. **Deploying.** A dry run, so reopen warnings (§8.2) show before
   confirming; choosing what reopens (§8.3).
3. **Local coding from R and Python** (`compositions.md`).
4. **Researcher API.** A webhook for new answers; per coder whether they are
   done; changing a unit field's type.
5. **Limits.** Quotas are built (`accounts.md`); open: storage in bytes.
6. **Unit preprocessing** at deploy (e.g. tokenizing), and a purge that
   blanks a value everywhere.
7. **History.** Unit versions and reset answers are kept; a coder's own edits
   update in place (no history).
8. **Researcher sessions**: list active sessions, log out everywhere, log out
   at the provider.
9. **Multimedia** should not flow through JSON: units reference media by id,
   the server returns short-lived signed URLs to a blob store.
10. **Semantic validation.** Running conditions on the server to
    reject answers to questions the coder never saw. Conditions now run in the
    client, which keeps client-side encryption possible.
11. **Scale.** A turn of a shared queue's lock reads the loop's codings and
    leases once and picks for every request waiting in that server process
    (up to 50, one per coder). Reading ~15k codings takes tens of ms, so a
    busy queue is limited by submits, not picks (`hosting.md` "Capacity").
    For very large queues: a per-unit summary kept up to date on submit.
    Researcher status is computed on demand.
12. **Unit cache** for the researcher UI (IndexedDB).
13. **Sample size targets**: coders per condition,
    shown on the Links page.
14. **Planned** (`plans/`): question loops and value branches, the design
    viewer, templates and an examples library, encrypting answers.

Smaller: a swipe-card UI review; `VariableValue` as a discriminated union.
Client gaps: `client.md` §9.
