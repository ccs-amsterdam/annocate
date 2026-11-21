# Annotinder server architecture

One server, `packages/server`, on Postgres:
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

So the server (TypeScript) runs the study: distribution, validation, sessions.
Other systems (AmCAT, R, Python) don't run a server of their own: they use
the researcher API to push units, designs and settings, and to download
annotations. One server, rather than a storage server and a separate study
server, avoids an API and a trust scheme between the two.

## 2. Roles

```
      researcher, R, Python, AmCAT                   coder
                │ researcher API                       │ coder API
                ▼ /study/...                             ▼ /d/<deploymentId>/...
 ┌─────────────────────────────────────────────────────────────────────┐
 │ server (TypeScript, packages/server)                                │
 │  researcher API: studies, designs, units, sets, links,               │
 │    deployment, progress, results                                    │
 │  runtime (per deployment): distribution, leases, validation;        │
 │    state in the database, only the deployment spec in memory        │
 │  database: the source of truth                                      │
 └─────────────────────────────────────────────────────────────────────┘
```

The server serves two APIs; [`docs/api/`](api/README.md) has the overview
and a page per API, with a section per endpoint.

- the **researcher API** (`researcherEndpoints`, [spec](api/researcher.md)),
  at `/study/...`, `/me` and `/auth/...`: used by the client's researcher UI
  (session cookie after logging in), scripts (R, Python) and other systems
  (API keys). Login and keys: `coder-identity.md` §7.
- the **coder API** (`coderEndpoints`, [spec](api/coder.md)), at
  `/d/<deploymentId>/...`: used by the client's coding screen. A deployment id is
  the study id, or `<studyId>.preview` for a researcher preview. No CORS: the
  session is an httpOnly cookie on the client's origin (`coder.ts`).

**The runtime** (`src/runtime/`) runs a deployed study for coders. It:

- resolves coders and serves the session and design;
- decides which unit a coder gets next, following the design's coder
  invitation and unit loops (all units or a filter, the coder's own units
  by a coder column, a shared queue with leases and stopping rules; plus
  overlap, practice and gold units);
- validates annotations against the design;
- writes them to the database;
- keeps only the deployment spec in memory (§3): any number of server
  processes can serve a study.

It reads and writes through a `Store` (`store.ts`): `DbStore` for the
database, `PreviewStore` for previews.

**client.** The researcher UI (`ResearcherApi`) talks to the researcher API,
the coding screen (`HttpCoderApi`, `StudyManager`) to the coder API. The client
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
   server processes can serve the same study
   (§11 has what is left).
3. **Decisions that count other coders run under a lock.** Picking from a
   shared queue (and leasing the unit), drawing a balanced set (`assign` mode)
   and a `balanced` group run in one transaction holding a database lock on
   that queue, group or variable (`Store.locked`, `pg_advisory_xact_lock`),
   so two coders, on any process, never get the same slot.
4. **Finished codings are derived, and kept in step.** A unit is finished in
   a loop when the coder answered every question of it (§8.2):
   `unit_codings` has a row per finished (loop, unit, coder), with the
   answers to the loop's agreement questions, written with the answers.
   What finishes a loop depends on the design, so when that changes (a
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

A possible hardening, not planned yet: encrypting coders' answers in
the client, so the server stores only ciphertext (`plans/encryption.md`).

## 5. Lifecycle

**Deploy.** A researcher calls `PUT /study/:studyId/deployment` with
`{ designVersionId, units, active }`: the design, with the draft units and
sets (new unit versions, §8.4) or the deployed ones. The server bumps the
deployment `version` when either changed, and freezes the design. Every
runtime checks the deployment's stamp on each request and re-reads it when
it changed; other changes coders' runtimes read (study settings, resets)
bump `deployments.revision` for that
(`Deployments.refresh`). Coders' browsers send the version their codebook belongs
to; requests with an older one get 409 `codebook_changed`, and the client
loads the session again (`api/coder.md`).

**Coder links.** Links are made by deploying: one, or one per coder of
the coder invitation's column (§7). They point at the
client with the deployment id (the study id) and the link's secret; the
client calls `/d/<studyId>/...`.

**Coder session.**

1. **First request.** The runtime resolves the session by device key (a hash
   of the device cookie's id, the deployment and a crowd's coder id, see
   `coder-identity.md` §4) and link
   secret, creating the session if needed and storing its coder and
   `$session` values (URL parameters, `source`, and the coder, §6.1, §7;
   `server/src/runtime/sessionValues.ts`); on every
   request after that, one query finds it.
2. **`GET /session`.** Returns the coder codebook (the coders' view of the design), per-loop progress, and the
   coder's variables (so client-side conditions can use drawn values).
3. **`GET /loop/:loop/next?count=k`.** The runtime works out the coder's
   units from their session values (§6), drawing any computed variable linked
   to a column the loop needs that the coder hasn't reached, and marks the
   loop as reached (`coders.assignments`, for progress). It then picks
   the coder's next k units (unfinished ones first) and, in a shared queue,
   leases them, reads them, and records the versions shown (`unit_serves`).
   A unit that no longer exists is skipped. The client asks for a batch (5)
   and again in the background before it runs out.
4. **`POST /variables/unit`.** The runtime checks that the unit was assigned
   to this coder, validates the variables, and writes them (and the
   codings they finish) to the database. The client sends answers in the
   background, one post at a time, in order (`StudyManager.save`): the coder
   goes on at once. A failure for lack of a connection is tried again; the
   end of the session waits until everything is saved.

**Researcher preview.** `POST /study/:studyId/deployment/preview` returns
deployment id `<studyId>.preview` and a token signed with the server's secret
(`ANNOTINDER_SECRET`; random per process if not set, so previews then end
with a restart). The client opens it like a link. The runtime runs the
latest design (checked on every request, so edits show at once) with the
real units, but keeps coders and answers in memory (`preview.ts`): a
preview stores nothing, and is gone when the server forgets the deployment.

**Researcher status.** `GET /study/:studyId/deployment/status`: units complete /
started / leased, codings and coders.

## 6. Distribution: the design describes the process

**Principle.** The design can name parameters, but never bind them. The
design is meant to be shared and reproduced. So it describes *how* units
are distributed, but it never contains unit ids or who the coders are.
There are three layers:

| Layer | Contains | Shared/reproducible? |
| --- | --- | --- |
| Design | questions, computed items, `show_if` items, `unit_loop` filters and placements, the session (the coder invitation with a crowd's distribution criteria, URL parameters, the normal end); refers to set columns and their values by name, and to coders only via `$session` values and coder-level answers | yes |
| Set columns | per column, named sets of units in order (e.g. column `coders`: `anna`, `bob`, `_overlap`) | data, not process |
| Links | made from the design's coder invitation (one, or one per coder), with a label, max uses and a fixed coder id | no (stored on the server only) |

**Why at the session level.** One idea, *who is this session for*, decides
a session's units: the coder column and the random conditions linked to a
column. Loops only filter and place units within those. A common setup
("three links for my three coders, with some overlap") is then one setting
and one column, rather than a set group, a link setting and a loop
setting that have to agree.

### 6.1 A session's units

Decided per session, for the whole study (contracts `design/session.ts`,
`shareOf` in the runtime). The coder invitation (`session.invite`) says who
codes:

```yaml
session:
  invite: { mode: coders, column: coders, link: per_coder }   # or link: login
```

```yaml
session:
  invite:
    mode: crowd                                     # the default: { mode: crowd }
    coderParam: { param: PROLIFIC_PID, pattern: "[0-9a-f]{24}" }    # optional: the coder id
    login: true                                     # optional: coders must sign in
    share:                                          # optional: a shared queue (crowd coding)
      until: { agree: 2, on: sentiment }            # or codersPerUnit: { min: 1 }
      codersPerUnit: { max: 5 }
      unitsPerCoder: { max: 100 }
    maxCoders: 200                                  # optional: the link's sample size
```

- **Specific coders** (`mode: "coders"`): `column` is a set column whose
  values are the coders; a session's units are its coder's (and the
  column's `_overlap`). `link: "per_coder"`: a link per value, the link's
  coder (`links.params.coder`) is the session's; a link whose coder is no
  longer in the column gets 403 `link_inactive`. `link: "login"`: one link,
  sign-in required, the coder is the login's address (all values email
  addresses; others get 403 `email_not_allowed`). `link: "pick_name"`: one
  link where coders pick their name from the column's values (`GET /names`,
  then `x-coder-name`; 409 `name_required` until they do). `nameDevices:
  "first"` (the default): a name is the first device's that picks it, others
  get 409 `name_taken`; `"any"`: picking a name continues its session (a team
  sharing devices). The names are shown to anyone with the link (a feature
  for a trusted team; email addresses are allowed). The coder is
  `$session.coder`.
- **A crowd** (`mode: "crowd"`): one link. `coderParam`: the coder id
  from a URL parameter (`{ param, pattern?, optional? }`), required (400
  `url_param_missing` / `url_param_invalid`) unless `optional: true` (a link
  without it then starts without a coder id). `login`: coders must sign in
  (401 `auth_required` otherwise); without a `coderParam` value the email is
  the coder id. `share`: distribution criteria (`CriteriaSchema`, §6.2)
  applied in every unit loop. Without them every coder codes all units.
  `maxCoders`: the link starts at most this many sessions (a link's own
  `maxUses` overrides it).
- **Who the coder is** (`$session.coder`, the session's `coder`): specific
  coders' value in the column (by their link, the picked name or the
  login's address), a crowd's id from `coderParam`, else the login's email
  where the crowd requires sign-in, or a coder id fixed on a link. A new
  device for a coder who already has a session is asked first (409
  `coder_has_session`, `coder-identity.md` §4).
- **Without a unit loop** the unit settings (specific coders' own units, a
  crowd's `share`) are kept but not used: validation warns ("... but the
  design has no unit loop yet"), and the links still follow the invitation
  (specific coders without units are valid, e.g. a survey of known
  experts).
- **Computed variables** (`type: "computed"`, `variable.type: "random"`, §7)
  are drawn when reached; with `units` they also select units, for the
  loops after them. They are the design's experimental conditions.

A session's units are the units whose cell holds the session's value in
every linked column (its coder, and each linked random condition),
including each column's `_overlap` units. Without linked columns: all
units.

Coders can always sign in (to keep their session across devices,
`coder-identity.md`); researchers see coders' emails only where the
invitation requires sign-in (contracts `loginRequired`: specific coders
with `login`, or a crowd with `login`).

### 6.2 Unit loops

Defined in `contracts/src/design/unitLoop.ts`. A loop has one `units`
object (absent: all the session's units, once, special units spread); it
works within the session's units like a filter:

```yaml
type: unit_loop
label: News items        # optional: shown in the editor, progress and exports
order: random            # sequential (default, the set's order) | random: each coder their own order
units:                   # optional
  filter: { column: phase, only: [post] }          # optional: only | except, on a set column
  own: true                                        # the coder's own units (default); false: only special units
  overlap: spread                                  # ignore | before | after | spread (default)
  practice: before
  gold: spread
  practiceCheck: { questions: [sentiment], retry: true }
  goldCheck: { questions: [sentiment], health: { start: 5, wrong: -1, end: screened_out } }
```

- **`filter`**: only (or all except) the session's units with given values
  of a set column: a pre and a post loop on a `phase` column, or a loop
  over the `_overlap` units first.
- **`own: false`**: the loop has only the special units (e.g. a practice
  round before the real coding).
- **Without a shared queue**: every coder codes all their units once.
- **A shared queue** (a crowd invitation's `share`, `CriteriaSchema`): each
  loop's units are a queue shared by the sessions with the same units (the
  same values of linked columns), within the filter. `effectiveLoopUnits`
  combines a loop's settings with it; an `until` rule applies only in loops
  that ask its question (elsewhere a unit is done after `until.agree`
  coders):
  - A unit is **done** once `codersPerUnit.min` coders finished it, or once
    `until.agree` of them gave the same answer to `until.on` (a question of
    the loop with one categorical answer). It is also done, regardless,
    once `codersPerUnit.max` coders finished it; `max` is required with
    `until`, so a unit nobody agrees on isn't coded forever.
  - `unitsPerCoder.max` caps the units per coder (besides special units).
  - **Open slots** are codings still needed, capped by
    `codersPerUnit.max`, minus active leases. Without open slots, a coder
    gets any unit that isn't **full**, least coded first. So a coder only
    gets nothing when every unit is full (`Reach` in
    `runtime/distribution.ts`).
  - `unitsPerCoder.min`: while a coder has fewer units, the maximum gives
    way too.
  - **Leases** last `leaseSeconds` (default 900). A coder asking for "next"
    while holding leases gets the same units again, so a reload is safe.
  - **`priority`:** `cover` (default) prefers least-coded units;
    `saturate` prefers units closest to done.

**Special units.** `_overlap`, `_practice` and `_gold` of the session's
columns (practice and gold of any set column) are placed among the coder's
own units by `overlap`, `practice` and `gold`: `ignore` (left out),
`before`, `after`, or `spread` evenly (the default). Spreading needs the
number of units a coder gets; in a shared queue without
`unitsPerCoder.max` it becomes a rate: about one in ten, at random (seeded
per coder) but never more than twenty apart, with the rest at the end
(`DEFAULT_RATE`; the runtime's internal placements are `first`, `last`,
`spread`, `rate`, `disabled`). A unit is in one special set of a column at
most.

- **Answer columns.** For each checked question `q`, the right answer is in
  the unit column `q_gold` (gold) or `q_practice` (practice), and a
  practice unit's own feedback in `q_practice_message` (optional). These
  columns are never served to coders. Answer cells (contracts
  `answerKey.ts`): `positive` (exactly this), `a;b` (these together),
  `positive|neutral` (any of these), `3..5` (a number in the range).
- **Practice** (`practiceCheck`) is checked in the browser as each question
  is answered (the practice unit comes with its answer cells). A wrong
  answer shows the unit's message, the loop's `message` (a template with
  `$unit` and `$var`) or the expected answer; the coder answers again until
  right (`retry`, the default) or may go on. The tries are stored with the
  answer's timing.
- **Gold** (`goldCheck`) is checked on the server; coders see nothing. With
  `health`, a score starts at `start` and changes by `wrong` and `right`
  (never above `start`); at 0 the session ends at the end item `end` (a
  screen-out), which the coder sees at once.

The pools behind this are internal (`server/src/runtime/distribution.ts`):
a loop has a pool for the coder's own units (a queue in a shared queue,
else fixed) and fixed pools for the special units.

**Nothing to route.** A coder's units in a loop follow from their session
values, recomputed on each request; nothing about them is stored.
`coders.assignments` only marks the loops a coder reached (by loop key,
`{ "<loop>": { "at": <ms> } }`), for the progress counts. A coder keeps the
units they coded in a loop (they can open and answer them again), even if
their values or the loop's settings no longer give them those units.

**One `units` per loop.** Groups that need other units differ in their
session values (their coder, or a computed variable linked to a column), not
in per-group loop settings: those would duplicate a loop's questions under
the same names, so groups' answers couldn't be told apart. Per-group
settings belong with value branches (`plans/question-loops.md` §5).

**Loops have no name.** Within one design version a loop is identified by
its position (`unitLoops`: `"1"`, `"2"`, ...): the coder API's
`/loop/:loop/...`, progress per loop, and the runtime's queues and leases.
Answers and "finished" don't depend on it: they are keyed by the loop's
questions (§8.2). The optional `label` is for people.

### 6.3 Set columns are explicit

Sets are stored lists, not recipes. That way adding units to a study never
changes an existing distribution. A **set column** is a unit field of type
`set` in the design (`units.fields`), stored as a set group of the same
name (`unit_sets`, `unit_set_members`, draft and `live`): each unit's cell
names its values (`anna`, `anna;bob`, `anna#3` with a position, `_overlap`,
`_practice`, `_gold`). A CSV upload can have such a column; it isn't part
of a unit's data, so changing it is no new unit version. Writing a set
column (`PUT /study/:studyId/sets/:column`) declares it in the draft design.

"Fill a set column" in the researcher UI shuffles the units with a seed,
sets aside an overlap, and divides the rest over the given values (a pure
function, `splitIntoSets` in contracts `sets.ts`).

**Deploy checks** (errors stop the deploy, warnings are shown):
- errors: a column the design names that isn't a set column; coders who
  sign in (`link: "login"`) whose values aren't all email addresses; a
  linked computed item's fixed values missing from its column;
- warnings: a column without values; units no session gets; column values
  a computed item doesn't list; the overlap, practice and gold checks.

## 7. Coder variables, URL parameters and links

**Computed variables** (`type: "computed"`; the one variable type is
`random`) are drawn, never asked, and never changed afterwards. They are
drawn when the coder *reaches* them in the design's flow: the client saves the answers so far, then asks the
server (`POST /variables/computed/:name`), and goes on with the value.
Coders screened out before one never get a value, so they don't count in
the balance.

- `draw: "random"`: weighted draw from `options` (server).
- `draw: "balanced"`: the value fewest coders have so far, a tie broken at random (server),
  counted in the database under a lock per variable (§3). With `stratify`
  (earlier coder-level questions, `session.<name>` values), only coders
  with the same values count: balanced within groups.
- With `units`, the value also selects the coder's units in the loops after
  it (`options` optional: then the column's values). A linked random
  condition reached by no path before a loop that needs it is drawn then.

The server refuses to let the client overwrite drawn values.

**Frozen answers.** A coder-level answer a unit loop depends on (the loop's
layout, questions or Show if conditions refer to it: contracts
`loopDependencies`) is frozen once the coder coded a unit in that loop.
`annotation_values.frozen` is set when a unit is submitted; later values
for it are ignored, and the coding screen shows it read-only.

**The session.** The design's `session` (edited above the item tree, as
"Coder invitations" and "URL parameters") holds the coder invitation
(§6.1), the URL parameters a link may carry, and the study's normal end:

```yaml
session:
  invite: { mode: crowd, coderParam: { param: PROLIFIC_PID } }
  urlParams:
    - { name: study, param: STUDY_ID, pattern: "[0-9a-f]{24}" }
    - { name: wave, values: [{ value: "1" }, { value: "2" }], default: "1" }
  end: { message: "Thank you!", redirectSetting: panel_return }   # the study's normal end
```

- **`end`**: what coders see when they get through the whole design, and
  where they are sent (`redirectUrl`, or `redirectSetting`: a deployment
  setting). Coders get it as an end item `_end` after the last item
  (contracts `toCoderItems`; the name is reserved); end items in the
  design are for ending early.
- **URL parameters** (`urlParams`) are added to a link by whoever shares
  it: URL key `param` (default the name), required unless they have a
  `default`, values any, a `pattern` (checked for catastrophic
  backtracking, `slowPattern`) or a list of `values` (`{ value, label? }`).
  At most 256 characters. A missing required value is 400
  `url_param_missing`, one that doesn't fit 400 `url_param_invalid`.

All are `$session.<name>`, stored on the session when it starts.
Built in: `$session.source` (an optional `?source=` on any link) and
`$session.coder` (who the coder is, §6.1); `coder` and `source` are
reserved. Experimental conditions are
computed items, never session values.

**Links** (stored on the server, never in the design) are made by
deploying (contracts `linkCombinations`): one, or for specific coders with
`link: "per_coder"` one per coder (`params: { coder }`; above 500 deploying
needs `confirmLinks`, at most 2000), keyed by their values so a link keeps
its secret across versions. Changes to the set columns sync them too. A
link no longer made (e.g. its coder is gone) is **retired** (403
`link_inactive` for new coders; coders who started keep working), never
deleted. A revoked link stops new coders and stays revoked through a
redeploy until it is reopened. The researcher sets only a link's label,
`maxUses` and a fixed coder id (`coder`; "Fixed coder id" on the Links
page).

**Sign-in** follows the coder invitation: required for specific coders
with `link: "login"` and a crowd with `login: true`; elsewhere coders may
sign in to keep their session across devices, and researchers don't see
their email. Coder ids and login: `docs/coder-identity.md`.

## 8. Resuming, and design updates

### 8.1 Resuming a session

When a coder reopens a session (reload, transfer, next day), the client
continues where they left off:

- **Top-level questions** that already have an answer that fits the current
  design are skipped. They stay reachable by navigating back.
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
  reload mid-unit, or after a design update added a question.

Finished units are identified by id, not by position: positions shift
between visits when distribution is dynamic.

### 8.2 What happens when the design changes

A researcher deploys a new design version for a running study. Answers are
keyed by question name, and the server and client always check them
against the **current** design (`validateAnswer`, shared via contracts):

| Change | Units the coder already finished | Unit in progress / new units |
| --- | --- | --- |
| Question added | reopened: served again, only the new question to answer (warning on deploy) | the new question is asked |
| Question removed | old answers kept in the database, no longer shown | not asked |
| Option values changed (an answer's value removed) | stay finished; the answer is dropped from view and asked again if the coder navigates back and resubmits | asked again |
| Question renamed | = removed + added | = removed + added |
| Show if / order changed | stay finished | follow the new design |
| Distribution changed | the coder's units follow the new settings; units they coded stay theirs (§6.2) | new rules apply |

How it works:

- **Annotations are stored per (unit, coder, variable)**, with `created`,
  `updated`, `designVersionId` and `retiredAt`. Only live rows (`retiredAt` empty)
  count, and only those must be unique. Writes upsert per variable, so
  answers to questions a later version removed are never overwritten. They
  stay as data, tagged with the design they were written under.
- **"Finished" is computed from the current design**: a unit is finished
  in a loop when *every* question of that loop has a live value. Questions a
  condition hid are stored as `skip`. The runtime only accepts complete
  units, so a stored unit is always complete under the design it was
  written with. Finished codings are rows of `unit_codings`, written with
  the answers (the runtime decides which loops a submit finishes, §3);
  `listFinished` (a query by the loop's variable names) derives them again
  when the design or the annotation epoch changes. Finished units are
  tracked per loop, so a unit in two loops is finished in each separately.
- **Order** in a coder's progress is when they first finished the unit
  (`unit_codings.created`), so editing a finished unit doesn't move it.
- **Adding a question to a loop reopens its finished units** (they lack the
  new answer). Coders get them back first, with their earlier answers, and
  answer only what's new. Deploying such a design returns a warning with
  the number of affected codings.
- **Reset** (`POST /study/:studyId/annotations/reset { variables, unitIds?,
  sessionIds? }`, a researcher action): retires live values instead of
  deleting them. The units are unfinished again; the old values stay for
  analysis. It bumps the deployment's `annotationEpoch`, so the runtime
  reloads.

### 8.3 Choosing what reopens (open)

With "finished = all current questions answered", adding a question always
reopens finished units, and a reset reopens chosen units explicitly. Still
open: letting the researcher add a question *without* reopening, e.g. by
naming the variables that define "finished" per loop (default: all). Hold
off until a real case asks for it.

Other open points:

- `totalUnits` is unknown in a shared queue without `maxUnits`; the client
  then counts the units seen so far.

### 8.4 Units: drafts, versions and fields

Everything is a draft until deployed: the design, the units and the set
columns. A preview runs the draft; a deploy makes it live. The design
declares the unit fields it expects (`units.fields`: name and type, e.g.
`text`, `image`, `set`); uploads are checked against them and the deploy
checks that every field the design uses exists.

- **Values** (`unit_values`): every field value once per study, by content
  (sha256, as 32 bytes: md5 pairs can be made on purpose). Field names are
  numbered per study (`unit_field_names`).
- **The draft** (`unit_draft`): each unit's working copy, field -> value,
  overwritten freely; `units.in_draft` says whether a unit is in it.
  Uploads, deletes and set changes only change the draft; a preview runs it.
- **Versions** (`unit_versions` + `unit_version_fields`) are made only by
  deploys: a deploy that changes a unit closes its current version
  (`to_deploy`) and opens one from that deployment version (`from_deploy`;
  the current one has `to_deploy` NULL). A replaced version no answer
  points to is deleted at that deploy, as are values nothing refers to:
  only coded content is kept. `deployment_versions` records what each
  deployed version changed.
- **Sets** (`unit_sets`: group and name, `unit_set_members`): the draft's,
  and the deployed (`live`) ones a deploy copies from it. No history: a
  coder's units follow from their session values (§6.1).
- Coders get the current versions, with only the fields the codebook
  uses (`shownUnitFields`: other columns, e.g. metadata or answer columns,
  stay on the server). Every answer points to the full unit version its
  coder saw (`annotation_values.unit_version_id`) and to its design
  version; what was shown is that version limited to that design's shown
  fields.
- A unit can be replaced after it was coded, with a warning
  (`overwriteCoded`): a new version, deployed with the next deploy;
  earlier answers keep theirs, so spans can always be read against the
  text they were made on. A unit with versions or answers is never
  deleted, only taken out of the draft.

## 9. The database

Postgres, through [Drizzle](https://orm.drizzle.team): `pg` against a
Postgres server in production, PGlite in development and tests. The same
code runs on both: one `Db` type is the database or a transaction, and
functions take a `Db`, so they also run inside a caller's transaction
(`db.transaction(async (tx) => ...)`).

- **The schema** is TypeScript, one file per area in
  `server/src/db/schema/`: accounts and server settings; studies, design
  versions, deployments and links; units (values, versions, drafts, sets);
  coders, devices and answers; distribution (leases, codings, serves); logs
  and rate limits. Columns are camelCase in code and snake_case in the
  database (Drizzle's `casing`). Row types come from the tables
  (`typeof coders.$inferSelect`); JSONB columns name their type.
- **Migrations** are generated from the schema (`pnpm --filter
  @annotinder/server db:generate`) into `server/migrations/`, and applied
  when a database is opened (Drizzle's `migrate()`; on Postgres under an
  advisory lock, so server processes starting together apply them once).
  Applied migrations are recorded in the `drizzle` schema. What Drizzle
  can't express goes in a hand-written migration: `0001_seed.sql` makes
  `rate_limits` unlogged and adds the default plan and the settings row.
- **Queries** use the query builder. A few are `sql` templates, written as
  named CTEs where they compare sets of rows: comparing the draft units
  with the deployed ones (`shared/units.ts`), bulk inserts from arrays
  (`unnest`, `INSERT ... SELECT`), advisory locks (distribution, units).
  Long lists of ids go as one array parameter (`anyOf`), since a query
  takes at most 65535 parameters.
- **SQL expressions** shared by queries are TypeScript functions that build
  SQL (`db/sql.ts`), not functions in the database: role resolution
  (`roleApplies`, `accountRole`, `studyRole`) and a unit's data and hash
  (`unitDraftData`, `unitVersionData`, `unitDataHash`, `unitValueHash`).
  They change with the code, and a schema change never has to rewrite a
  stored function.

## 10. Code map

| Where | What |
| --- | --- |
| `contracts/src/design/unitLoop.ts` | a `unit_loop`'s `units`: filter, own units, placements, practice and gold checks; distribution criteria |
| `contracts/src/design/session.ts` | The Study entry: the coder invitation, URL parameters, the normal end; the links a design makes |
| `contracts/src/design/references.ts`, `condition.ts` | `$unit`/`$var` references, template parsing, scopes; conditions (scripts), helper methods, simple conditions |
| `contracts/src/sets.ts` | Set groups and sets, set columns, `splitIntoSets` |
| `contracts/src/deployment.ts` | Deployment, reset, status and preview schemas (researcher API) |
| `contracts/src/endpoints/` | The two API registries: researcher, coder ([docs/api](api/README.md)) |
| `server/src/app.ts` | Hono app: everything API under `/api`: researcher API (`/api/study`, `/api/me`, `/api/auth`), admin API (`/api/admin`), coder API (`/api/d/<deploymentId>`), `/api/health`; and the built client (`ANNOTINDER_CLIENT_DIR`) |
| `server/src/coder.ts` | The coder API routes: session cookie, coder resolution, units, answers, transfers |
| `server/src/researcher/` | The researcher API, one file per path; `auth.ts` (sessions, API keys, dev headers), `login.ts` (`/auth/...`) |
| `server/src/oidc.ts`, `shared/accounts.ts`, `shared/sessions.ts` | Researcher login with an OpenID Connect provider, users and API keys, sessions |
| `server/src/shared/` | Database queries shared by both APIs (deployments, finished units, units, coders, ...) |
| `server/src/db/` | The database (Drizzle on `pg` or PGlite): `schema/` the tables per area, `index.ts` opening it and applying the migrations, `sql.ts` SQL expressions (role resolution, unit data) |
| `server/migrations/` | The migrations Drizzle generates from the schema (`db:generate`), plus the hand-written seed |
| `server/src/runtime/registry.ts` | `Deployments`: lazily loads one runtime per deployment; failures aren't cached; revision bumps, status, preview tokens |
| `server/src/runtime/runtime.ts` | `DeploymentRuntime`: spec, a coder's units, distribution under locks, computed variables, status |
| `server/src/runtime/store.ts` | `Store`: what the runtime reads and writes; `DbStore` on the database |
| `server/src/runtime/types.ts` | The runtime's internal types (spec, coder, annotations, finished rows) |
| `server/src/runtime/session.ts` | Coder session cookies, CSRF header |
| `server/src/runtime/preview.ts` | Researcher previews: preview tokens, `PreviewStore` with in-memory coders and answers |
| `server/src/runtime/distribution.ts` | `UnitPool` (fixed, or a shared queue), `pickNext` (own units and overlap), `Codings` |
| `server/src/runtime/designItems.ts` | Loop/variable lookup, annotation validation, agreement keys |
| `client/.../admin/UnitLoopForm.tsx` | Editor for a loop's units (filter, own units, special units and checks) and layout |

Tests (`server/src/__tests__/`) run through the app's fetch handler on
PGlite (or a Postgres server with `TEST_DATABASE_URL`): `coder.test.ts`
runs coders end to end (a new app on the same database is a restart),
`app.test.ts` the researcher API and the store's queries,
`researcherApi.test.ts` the API as a script uses it (responses checked
against the contract schemas), `login.test.ts` login against a mock
provider.

## 11. Open questions and next steps

Roughly in order:

1. **Several server processes.** Built for it (§3), not run that way yet.
   Previews keep their coders and answers in one process's memory
   (`preview.ts`): with several processes a preview needs them in the
   database (marked as preview data, deleted when it expires), or its
   requests routed to one process. A study's limit on answers is counted per
   process between reads (once a minute), so a study can pass it by a little.
   Rough load for a large crowd study (1000 coders at once, a unit every 20 s,
   batches of 5): ~50 submits, ~10 locked picks and ~60 coder lookups per
   second, well within one modest Postgres; size the connection pools so
   all processes together stay under `max_connections`.
2. **Deploying follow-ups.**
   - A dry run of a deploy, so the reopen warnings (§8.2) show before
     confirming instead of after.
   - Choosing what reopens after a design update (§8.3).
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
6. **Unit preprocessing.** Preprocessing (e.g. tokenizing once on the
   server) would happen at deploy, with the new versions (§8.4). Also
   open: a purge that blanks a value everywhere (privacy).
7. **Keeping history.** Unit versions are kept (§8.4). Answers reset by a
   researcher are kept as retired rows; a coder changing an answer updates
   it in place (no history of a coder's own edits; adding it later is a
   new table, not a change to this one).
8. **Sessions.** For researchers: a list of active sessions, logging out
   everywhere, logging out at the provider.
9. **Multimedia.** Images, audio and video in units should probably **not**
   flow through the JSON path. Proposal: units reference media by id; the
   server returns short-lived signed URLs to a blob store. This keeps the
   runtime's memory JSON-only.
10. **Semantic validation.** Validation checks variable names, option
    values, items, and the arguments of helpers in simple conditions. Running Show if conditions (QuickJS)
    server-side, to reject answers to questions the coder should never
    have seen, would be the next step. Show if conditions run in the
    client, which keeps client-side encryption of answers possible
    (`plans/encryption.md`).
11. **Scale.** A pick from a shared queue reads the loop's finished codings
    and leases (bounded by units x `codersPerUnit.max`), under the queue's lock
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
13. **Sample size targets.** Coders per set column value, or a target
    number of sessions per condition, with the Links page showing how far
    each is.
14. **Planned, not built** (`plans/`): question loops and value branches,
    the design viewer (including importing a design file into a new study),
    templates and an examples library (`examples.md`), and (on hold)
    encrypting answers in the browser.

Smaller things worth an issue: a swipe-card UI for the `annotinder` answer
type; `VariableValue` as a discriminated union; a live preview of a
design item while editing it. Client gaps: `client.md` §9.
