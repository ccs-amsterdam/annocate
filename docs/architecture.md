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
  study id, or `<studyId>.preview` for a preview. No CORS: the session is an
  httpOnly cookie on the client's origin.
- **Admin API** ([spec](api/admin.md)): `/admin/...`, server settings and accounts.

**The runtime** (`src/runtime/`) runs a deployed study. It resolves coder
sessions, decides which units a coder gets next (following the coder
invitation and the unit loops), validates answers and writes them. It reads
and writes through a `Store` (`store.ts`): `DbStore` for the database,
`PreviewStore` for previews.

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
3. **Decisions that count other coders run under a lock.** Picking from a
   shared queue (and leasing the unit) and drawing a `balanced` value run in
   one transaction holding a database lock on that queue or variable
   (`Store.locked`, `pg_advisory_xact_lock`), so two coders never get the
   same slot.
4. **Finished codings are derived and kept in step.** A unit is finished in
   a loop when the coder answered every question of it (§8.2).
   `unit_codings` has a row per finished (loop, unit, coder session), with
   the answers to the loop's agreement questions, written with the answers.
   When what finishes a loop changes (a redeploy with other loop positions or
   questions: `codingsSignature`) or answers are reset (`annotationEpoch`),
   they are derived from the answers again, once (`deployments.codings_basis`;
   the first process to get the lock does it).

Previews are the exception: coders and answers live in one process's memory
(`preview.ts`).

## 4. Trust and hosting

The server sees units and answers in plaintext, like any web application.
Where it runs is the researcher's choice: annotinder.com (hosted by us, in
the EU) or self-hosted for sensitive data. Encrypting answers in the browser
is a possible later hardening (`plans/encryption.md`).

## 5. Lifecycle

**Deploy.** `PUT /study/:studyId/deployment` with
`{ designVersionId, units, active }` deploys a design version, with the draft
units and sets (new unit versions, §8.4) or the deployed ones. The server
bumps the deployment `version` when either changed and freezes the design
version. Other changes runtimes must see (study settings, resets) bump
`deployments.revision`. Coders' browsers send the version their codebook
belongs to; an older one gets 409 `codebook_changed` and the client reloads
the session (`api/coder.md`).

**Links** are made by deploying: one, or one per coder of the invitation's
column (§7). They open the client with the deployment id and the link's
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
   session values (§6), drawing any linked computed variable the loop needs,
   and marks the loop as reached (`coder_sessions.assignments`, for
   progress). It picks the next k units (unfinished first); in a shared queue
   it leases them; it records the versions shown (`unit_serves`). The client
   asks for 5 and again before it runs out.
4. **`POST /variables/unit`** checks the unit was assigned to this coder,
   validates the answers and writes them, with the codings they finish. The
   client posts in the background, one at a time, in order
   (`StudyManager.save`); the coder goes on at once.

**Preview.** `POST /study/:studyId/deployment/preview` returns deployment id
`<studyId>.preview` and a token signed with `ANNOTINDER_SECRET` (random per
process if unset, so previews end at a restart). The runtime runs the latest
design version (checked on every request, so edits show at once) with the
real units, but keeps coders and answers in memory: a preview stores nothing.

**Status.** `GET /study/:studyId/deployment/status`: units complete, started
and leased; codings and coders.

## 6. Distribution: the design describes the process

**Principle: the design names parameters but never binds them.** A design is
meant to be shared and reproduced, so it says *how* units are distributed,
never which unit ids or which people.

| Layer | Contains | Reproducible? |
| --- | --- | --- |
| Design | questions, computed items, Show if items, unit loops (filters, placements), the session (coder invitation with a crowd's distribution criteria, URL parameters, the normal end). Refers to set columns and values by name, to coders only via `$session` values | yes |
| Set columns | per column, named sets of units in order (e.g. column `coders`: `anna`, `bob`, `_overlap`) | data |
| Links | made from the coder invitation (one, or one per coder), with label, max uses, fixed coder id | no (server only) |

One idea, *who is this session for*, decides a session's units: the coder
column and the random conditions linked to a column. Loops only filter and
place units within those. "Three links for my three coders, with some
overlap" is then one setting and one column.

### 6.1 A session's units

Decided per session, for the whole study (contracts `design/session.ts`,
`shareOf` in the runtime). The coder invitation (`session.invite`) says who
codes:

```yaml
session:
  invite: { mode: coders, column: coders, link: per_coder }   # or login, pick_name
```

```yaml
session:
  invite:
    mode: crowd                                   # the default: { mode: crowd }
    coderParam: { param: PROLIFIC_PID, pattern: "[0-9a-f]{24}" }   # optional: the coder id
    login: true                                   # optional: coders must sign in
    share:                                        # optional: a shared queue
      until: { agree: 2, on: sentiment }          # or codersPerUnit: { min: 1 }
      codersPerUnit: { max: 5 }
      unitsPerCoder: { max: 100 }
    maxCoders: 200                                # optional: the link's sample size
```

**Specific coders** (`mode: "coders"`): `column` is a set column whose values
are the coders; a session gets its coder's units plus the column's
`_overlap`.

| `link` | How coders get in |
| --- | --- |
| `per_coder` | a link per value; the link's coder (`links.params.coder`) is the session's. A link whose coder left the column: 403 `link_inactive` |
| `login` | one link, sign-in required; the coder is the login's address (all values must be email addresses; others get 403 `email_not_allowed`) |
| `pick_name` | one link; coders pick their name (`GET /names`, then `x-coder-name`; 409 `name_required` until they do). `nameDevices: "first"` (default): a name belongs to the first device that picks it (others: 409 `name_taken`); `"any"`: picking a name continues its session. Names are visible to anyone with the link |

**A crowd** (`mode: "crowd"`): one link.

- `coderParam`: the coder id from a URL parameter, required (400
  `url_param_missing` / `url_param_invalid`) unless `optional: true`.
- `login`: coders must sign in (401 `auth_required`); without a `coderParam`
  value the email is the coder id.
- `share`: distribution criteria (`CriteriaSchema`, §6.2) for every unit
  loop. Without them every coder codes all units.
- `maxCoders`: the link starts at most this many sessions (a link's own
  `maxUses` overrides it).

**Who the coder is** (`$session.coder`): the specific coder's value, a crowd's
`coderParam` value, else the login's email where sign-in is required, or a
coder id fixed on the link. A new device for a coder who already has a
session is asked first (409 `coder_has_session`, `coder-identity.md` §4).

**Without a unit loop** the unit settings are kept but unused (validation
warns); links still follow the invitation, e.g. a survey of known experts.

**Computed variables** (`type: "computed"`, §7) are drawn when reached; with
`units` they also select units for the loops after them. They are the
design's experimental conditions.

A session's units are those whose cell holds the session's value in every
linked column (its coder, each linked random condition), plus each column's
`_overlap`. Without linked columns: all units.

Coders can always sign in (to keep their session across devices);
researchers see emails only where the invitation requires sign-in
(contracts `loginRequired`).

### 6.2 Unit loops

Defined in `contracts/src/design/unitLoop.ts`. A loop has one optional
`units` object (absent: all the session's units, once, special units spread)
and works within the session's units like a filter:

```yaml
type: unit_loop
label: News items        # optional: shown in the editor, progress and exports
order: random            # sequential (default, the set's order) | random per coder
units:
  filter: { column: phase, only: [post] }      # only | except, on a set column
  own: true                                    # the coder's own units (default); false: only special units
  overlap: spread                              # ignore | before | after | spread (default)
  practice: before
  gold: spread
  practiceCheck: { questions: [sentiment], retry: true }
  goldCheck: { questions: [sentiment], health: { start: 5, wrong: -1, end: screened_out } }
```

- **`filter`**: only (or all except) units with given values of a set column,
  e.g. a pre and a post loop on a `phase` column.
- **`own: false`**: only the special units (e.g. a practice round).
- **Without a shared queue** every coder codes all their units once.
- **With a shared queue** (the crowd's `share`), each loop's units are a queue
  shared by sessions with the same units. `effectiveLoopUnits` combines the
  loop with it. An `until` rule applies only in loops that ask its question.
  - A unit is **done** once `codersPerUnit.min` coders finished it, or
    `until.agree` coders gave the same answer to `until.on` (a single
    categorical question of the loop), or `codersPerUnit.max` coders finished
    it (`max` is required with `until`).
  - `unitsPerCoder.max` caps units per coder (special units aside);
    `unitsPerCoder.min` lets the maximum give way while a coder has fewer.
  - **Open slots** are codings still needed (capped by `codersPerUnit.max`)
    minus active leases. Without open slots a coder gets any unit that isn't
    **full**, least coded first; so a coder gets nothing only when every unit
    is full (`Reach` in `runtime/distribution.ts`).
  - **Leases** last `leaseSeconds` (default 900). Asking "next" while holding
    leases returns the same units, so a reload is safe.
  - **`priority`**: `cover` (default) prefers least-coded units, `saturate`
    units closest to done.

**Special units.** `_overlap`, `_practice` and `_gold` of the session's
columns (practice and gold of any set column) are placed among the coder's
own units: `ignore`, `before`, `after`, or `spread` (default). Spreading
needs the number of units a coder gets; in a shared queue without
`unitsPerCoder.max` it becomes a rate: about one in ten, seeded per coder,
never more than twenty apart (`DEFAULT_RATE`). A unit is in at most one
special set of a column.

- **Answer columns.** For each checked question `q`, the right answer is in
  unit column `q_gold` or `q_practice`, practice feedback in
  `q_practice_message` (optional). Never served to coders. Cells (contracts
  `answerKey.ts`): `positive` (exactly), `a;b` (together), `positive|neutral`
  (any of), `3..5` (a range).
- **Practice** (`practiceCheck`) is checked in the browser per question. A
  wrong answer shows the unit's message, the loop's `message` or the expected
  answer; the coder retries until right (`retry`, default) or goes on. Tries
  are stored with the answer's timing.
- **Gold** (`goldCheck`) is checked on the server; coders see nothing. With
  `health`, a score starts at `start` and changes by `wrong` and `right`
  (never above `start`); at 0 the session ends at end item `end` (a
  screen-out).

**Nothing to route.** A coder's units follow from their session values,
recomputed per request; nothing about them is stored except which loops a
coder reached (`assignments`, by loop key, `{ "<loop>": { "at": <ms> } }`).
A coder keeps units they coded in a loop even if their values or the loop's
settings change.

**One `units` per loop.** Groups that need other units differ in session
values, not per-group loop settings (those would duplicate a loop's
questions under the same names). Per-group settings belong with value
branches (`plans/question-loops.md` §5).

**Loops have no name.** Within a design version a loop is its position
(`unitLoops`: `"1"`, `"2"`, ...): in `/loop/:loop/...`, progress, queues and
leases. Answers and "finished" are keyed by the loop's questions (§8.2). The
optional `label` is for people.

### 6.3 Set columns are explicit

Sets are stored lists, not recipes, so adding units never changes an
existing distribution. A **set column** is a unit field of type `set`
(`units.fields`), stored as a set group (`unit_sets`, `unit_set_members`,
draft and `live`). Each unit's cell names its values: `anna`, `anna;bob`,
`anna#3` (with a position), `_overlap`, `_practice`, `_gold`. Sets aren't
unit data: changing them makes no new unit version. Writing a set column
(`PUT /study/:studyId/sets/:column`) declares it in the draft design.

"Fill a set column" in the UI shuffles the units with a seed, sets aside an
overlap, and divides the rest over the given values (`splitIntoSets`,
contracts `sets.ts`).

**Deploy checks:**

- errors: a column the design names that isn't a set column; sign-in coders
  (`link: "login"`) whose values aren't all email addresses; a linked
  computed item's fixed values missing from its column;
- warnings: a column without values; units no session gets; column values a
  computed item doesn't list; the overlap, practice and gold checks.

## 7. Coder variables, URL parameters and links

**Computed variables** (`type: "computed"`, variable type `random`) are drawn,
never asked, never changed. They are drawn when the coder *reaches* them: the
client saves the answers so far, calls `POST /variables/computed/:name` and
goes on with the value. Coders screened out before one don't count.

- `draw: "random"`: a weighted draw from `options`.
- `draw: "balanced"`: the value fewest coders have so far (ties at random),
  under a lock per variable (§3). With `stratify` (earlier coder-level
  questions, `session.<name>` values) balanced within groups.
- With `units`, the value also selects the coder's units in later loops
  (`options` optional: then the column's values). A linked condition not yet
  reached when a loop needs it is drawn then.

The client can't overwrite drawn values.

**Frozen answers.** A coder-level answer a loop depends on (its layout,
questions or Show if conditions refer to it: contracts `loopDependencies`) is
frozen once the coder coded a unit in that loop
(`annotation_values.frozen`); the coding screen shows it read-only.

**The session.** The design's `session` (the Study entry, edited above the
item tree) holds the coder invitation (§6.1), the URL parameters, the normal
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
  any value, a `pattern` (refused if it could backtrack catastrophically:
  `slowPattern`) or a list of `values`. At most 256 characters. Missing: 400
  `url_param_missing`; not fitting: 400 `url_param_invalid`.

All are `$session.<name>`, stored on the session when it starts. Built in:
`$session.source` (an optional `?source=` on any link) and `$session.coder`;
`coder` and `source` are reserved. Experimental conditions are computed
items, never session values.

**Links** (on the server, never in the design) are made by deploying
(contracts `linkCombinations`): one, or for `link: "per_coder"` one per coder
(`params: { coder }`; above 500 deploying needs `confirmLinks`, at most 2000),
keyed by their values so a link keeps its secret across versions. Changes to
set columns sync them. A link no longer made is **retired** (403
`link_inactive` for new coders; started coders go on), never deleted. A
revoked link stays revoked through a redeploy until reopened. The researcher
sets only a link's label, `maxUses` and a fixed coder id.

**Sign-in** is required for specific coders with `link: "login"` and a crowd
with `login: true`; elsewhere it is optional and researchers don't see the
email. Details: `coder-identity.md`.

## 8. Resuming, and design updates

### 8.1 Resuming a session

When a coder comes back (reload, transfer, next day) the client continues
where they left off:

- **Top-level questions** with an answer that fits the current design are
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

### 8.2 What happens when the design changes

Answers are keyed by question name and always checked against the
**current** design (`validateAnswer`, shared via contracts):

| Change | Units already finished | Unit in progress, new units |
| --- | --- | --- |
| Question added | reopened: only the new question to answer (warning on deploy) | asked |
| Question removed | old answers kept, not shown | not asked |
| Option value removed | stay finished; the answer is asked again if the coder goes back and resubmits | asked again |
| Question renamed | = removed + added | = removed + added |
| Show if / order changed | stay finished | follow the new design |
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
| `contracts/src/design/unitLoop.ts` | a loop's `units`: filter, placements, practice and gold checks; distribution criteria |
| `contracts/src/design/session.ts` | the Study entry: coder invitation, URL parameters, normal end, display |
| `contracts/src/design/references.ts`, `condition.ts` | `$unit`/`$var`/`$session` references, templates, conditions, helpers |
| `contracts/src/sets.ts` | set columns, `splitIntoSets` |
| `contracts/src/deployment.ts` | deployment, reset, status and preview schemas |
| `contracts/src/endpoints/` | the API registries ([docs/api](api/README.md)) |
| `server/src/app.ts` | the Hono app: all APIs under `/api`, plus the built client (`ANNOTINDER_CLIENT_DIR`) |
| `server/src/coder.ts` | coder API routes: session cookie, coder resolution, units, answers, transfers |
| `server/src/researcher/` | researcher API, one file per path; `auth.ts`, `login.ts` |
| `server/src/oidc.ts`, `shared/accounts.ts`, `shared/sessions.ts` | researcher login, users and API keys, sessions |
| `server/src/shared/` | queries shared by the APIs |
| `server/src/db/` | `schema/`, `index.ts` (open and migrate), `sql.ts` |
| `server/src/runtime/registry.ts` | `Deployments`: one runtime per deployment, loaded lazily; revisions, status, preview tokens |
| `server/src/runtime/runtime.ts` | `DeploymentRuntime`: a coder's units, distribution under locks, computed variables |
| `server/src/runtime/store.ts` | `Store` and `DbStore` |
| `server/src/runtime/preview.ts` | previews: tokens, `PreviewStore` in memory |
| `server/src/runtime/distribution.ts` | `UnitPool` (fixed or shared queue), `pickNext`, `Codings` |
| `server/src/runtime/designItems.ts` | loop and variable lookup, answer validation, agreement keys |

Tests (`server/src/__tests__/`) run through the app's fetch handler on
PGlite (or Postgres with `TEST_DATABASE_URL`): `coder.test.ts` runs coders end
to end, `app.test.ts` the researcher API, `researcherApi.test.ts` the API as a
script uses it (checked against the contract schemas), `login.test.ts` login
against a mock provider.

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
10. **Semantic validation.** Running Show if conditions on the server to
    reject answers to questions the coder never saw. Conditions now run in the
    client, which keeps client-side encryption possible.
11. **Scale.** A pick from a shared queue reads the loop's codings and leases
    under the queue's lock. With 10k units and ~12k codings a pick takes
    ~40 ms (`hosting.md` "Capacity"), so one queue serves ~25 picks per
    second. For very large queues: a per-unit summary kept up to date on
    submit. Researcher status is computed on demand.
12. **Unit cache** for the researcher UI (IndexedDB).
13. **Sample size targets**: coders per set column value or per condition,
    shown on the Links page.
14. **Planned** (`plans/`): question loops and value branches, the design
    viewer, templates and an examples library, encrypting answers.

Smaller: a swipe-card UI review; `VariableValue` as a discriminated union.
Client gaps: `client.md` §9.
