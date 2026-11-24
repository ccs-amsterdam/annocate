# Release plan: pilot this week

One plan from the six pre-release reviews (server security, server quality,
contracts, coding client, admin client, docs and hosting), with duplicates
merged. Written to be executed item by item by an orchestrating agent and
worker agents. The review reports themselves were temporary; everything a
worker needs is in the item.

After the release the design format, the HTTP API and the database schema are
frozen (additions only). Anything that changes them is in phase B1 or is a
decision in section A.

**Fixed already:** a changed answer in a finished unit is saved at once
(`StudyManager.advanceUnit`, commit `ea26aa5`). The coding reviewer's
draft and carry-over findings were re-checked against that code: B1-25 and
B1-26 still stand (the fix narrows B1-26 but makes B1-27 easier to reach).

## How to run this plan

- Branch `claude/annotinder-server-architecture-psxrk6`. No compatibility
  code. Schema changes are made in `db/schema/*` and `0000_init.sql` is
  regenerated in place, until B7-01 freezes it. No model names in commits.
- **Order:** B1 serial lane first (group `serial`, one worker, items in id
  order). The other B1 groups may run next to it, except that a rename item
  (B1-13, B1-14, B1-16) runs with every other worker stopped and rebased
  after it. Then B2, B3, B4, B5 per group. B6 and B7 can start at any time
  (their groups touch nothing else), except B7-01, which is last.
- **Parallel groups:** an item names one group. A group owns files; items of
  one group are done by one worker, in id order across phases. Two groups
  never edit the same file. If an item needs a line in another group's file,
  it says so, and the worker hands that line to the owner.

  | Group | Owns |
  | --- | --- |
  | `serial` | `packages/contracts/src/**`, `packages/server/src/db/schema/**`, `packages/server/migrations/**`, and any repo-wide rename while its item runs |
  | `srv-app` | `server/src/{app,index,config,context,database}.ts`, `db/index.ts`, `shared/{http,request,rateLimit,securityHeaders,limits}.ts` |
  | `srv-login` | `researcher/{login,auth,admin*,me}.ts`, `shared/{accounts,sessions,securityLog}.ts`, `oidc.ts`, `identities.ts`, `keys.ts` |
  | `srv-runtime` | `runtime/**`, `coder.ts`, `coderAccount.ts`, `shared/{links,deployments,devices,finished}.ts`, `db/locks.ts` |
  | `srv-export` | `shared/{studyExport,resultsExport,coderDeletion,files}.ts`, `researcher/{studyExport,annotations*,coders}.ts` |
  | `srv-data` | `shared/{units,recipes,sets,progress,coderStudies,designVersions,warnings}.ts`, `researcher/{results,units*,sets,design*,study*,links,deployment*,overview,examples}.ts`, `shared/results/**` |
  | `cli-manager` | `client/src/lib/studyManager/**`, `lib/session/**`, `lib/api/httpCoderApi.ts` |
  | `cli-runner` | `lib/components/*.tsx` (top level), `components/{studyRunner,answerFields,codingNav,selectableText}/**`, `lib/{keyboard,display,context,hooks,codebook}/**`, `pages/**`, `App.tsx` |
  | `cli-editor` | `lib/design/**`, `components/admin/{designEditor,designTree,itemForm,unitLoop,variableType,jsonEditor,session}/**`, `components/admin/{Design*,ItemForm,SessionItemForm,UnitLoopForm,OptionsEditor,ConditionEditor,VariableTypeForm,LayoutDesigner,TemplateInsertMenu,UnsavedChangesDialog}.tsx` |
  | `cli-admin` | the rest of `components/admin/**`, `lib/admin/**`, `src/components/ui/**` |
  | `docs` | `docs/**`, `README.md`, `notes.md`, `packages/*/README.md`, `packages/contracts/CONTRACTS.md`, `client/src/lib/help/**` |
  | `bench` | `packages/server/scripts/**`, `bench/**` |
  | `ops` | `.github/**`, `Dockerfile`, `compose.yml`, `.env.example`, `scripts/**`, `LICENSE`, `SECURITY.md`, `CHANGELOG.md` |
  | `e2e` | `packages/e2e/**` |

  New test files belong to the group of the code they test.
- **Verify** (from `CLAUDE.md`; every item ends with `LINT` plus the checks named):
  - `LINT`: `pnpm -r lint`
  - `VC`: `cd packages/contracts && pnpm build && pnpm test`
  - `VS`: `cd packages/server && npx tsc --noEmit -p . && pnpm test`
  - `VL`: `cd packages/client && npx tsc --noEmit -p tsconfig.app.json && pnpm test`
  - `E2E`: only at three milestones: after B1+B2, after B3, and in B7-10.
  - A contracts change needs `VC`, then `VS` and `VL` (both import the build).
- **Sizes:** S = under an hour of worker time, M = one to three hours, L = more.
- **Decisions:** an item that needs a decision (D-number) is skipped until the
  owner has answered. "If not decided" in section A says what then stays
  frozen as it is.
- **Refactors (B3)** are moves with behaviour unchanged: tests green before and
  after, no bug fix in the same commit. They are ordered by value per group;
  what is not done by the release can follow it (nothing in B3 changes a
  frozen surface).
- **Spot-check.** About 35 findings were checked against the code at `ea26aa5`;
  file and line references in this plan are from that check where given.
  Marked **(unverified)**: claims the reviewers reasoned but did not run and
  that were not re-run here; the item's first step is then a failing test.
  One reference was wrong in a report and is corrected here (the coder-home
  subqueries are at `shared/coderStudies.ts:14-20`).

---

## Progress

- Done before the run: B1-29 (`updateItem` replaces an item's settings; `itemShape` accepts layout items: `4c710ea`), B1-21 part (2) (import appends rows in place). Still open in B1-29: `itemJson.ts`/`carryKeys` with layout and else items, if the worker finds a gap.

## A. Decisions for the owner

Only choices about product behaviour or the frozen surfaces. Recommendation
first; each row is one answer ("yes" = the recommendation).

### Design format and stored data

| # | Decision | Options | Recommendation | If not decided | Items |
| --- | --- | --- | --- | --- | --- |
| D1 | **Loop identity.** Loops are keyed by position (`"1"`, `"2"`) in `/loop/:loop`, `unit_codings.loop_key`, `unit_leases.loop_key`, `coder_sessions.assignments`, results, `variables.csv loop_number`, `finished_loop<n>` | (a) `unit_loop` gets a required, unique `name` (editor generates `loop1`), everything keyed by it; (b) keep positions, but a deploy refuses to insert, remove or reorder loops once coders have started; (c) leave | (a) | Positions are frozen in stored data and exports; inserting a practice loop mid-study attaches coders' progress and "same as previous" unit lists to the wrong loop (B1-08 then only does (b)) | B1-08, B1-16, B5-03 |
| D2 | **Unknown keys in a design.** `{ "multipel": true }` validates today and is stored | (a) all design schemas strict, plus `meta: Record<string, unknown>` on items for other tools; (b) strict without `meta`; (c) leave | (a) | Typos are stored silently; any field added later may collide with a key someone already used | B1-09 |
| D3 | **Format version on stored designs.** Only the design *file* has one | (a) `design_versions.format_version integer not null default 1`, echoed in the API, optional in writes; (b) leave | (a) | The first breaking format change has to guess which rows are old | B1-07 |
| D4 | **Question type `annotinder`** (a product name as an enum value in every stored design and in `variables.csv`) | (a) rename to `swipe`; (b) merge into `nominal` with `layout: "swipe"`; (c) leave | (a): a rename is mechanical; (b) is a redesign for which there is no time | The name is permanent | B1-13 |
| D5 | **Experiment vocabulary.** Item `type: "experiment"` holds `variable: { type: "random", draw }`; `units: true` means "selects units" | (a) `variable.type: "experiment"`, `units: true` → `selectsUnits: true`; (b) leave | (a) | `random` stays in stored designs and in `variables.csv type` | B1-13 |
| D6 | **Option values.** A nominal value may hold `;`, `|`, a newline or look like `3..5`; answer keys and CSV cells then can't be split back | (a) refuse `;`, `|`, newlines and a leading `n..`, max 128 characters; (b) escape in keys and exports; (c) leave | (a) | Such values are stored; answer keys on them never match | B1-10 |
| D7 | **Answer-key columns** are a name prefix (`answer_<q>`, `feedback_<q>`): any data column so named is hidden from layouts, with an error only at design time | (a) at upload, refuse `answer_*`/`feedback_*` unless `<q>` is a question, and say the prefixes are reserved; (b) field types `answer`/`feedback` with a `question` property; (c) leave | (a) | Researchers with a column `answer_text` hit a confusing error; (b) becomes impossible | B1-10 |
| D8 | **`VariableValue`.** `done` is stored on every answer and read by nothing; unknown keys are accepted; span ids from the client are unbounded | (a) keep the shape; remove `done` from the stored value (the server knows a unit is finished from `unit_codings`), make the object strict, bound ids to 64 characters of `[A-Za-z0-9_-]`; (b) keep `done` and document it, strict + bound; (c) leave | (b) this week ((a) touches the submit protocol) | Junk keys can accumulate in the most-stored JSON | B1-11 |
| D9 | **Export column names.** A question named `coder`, `email` or `link`, or the pair `a` / `a_label`, gives duplicate columns in `annotations.csv` / `coders.csv` | (a) reserve the system column names and the suffix pattern in design validation, keep `_label` etc.; (b) also switch derived columns to `q.label`, `q.special`, `q.comment`, `q.json`; (c) leave. Separately: names unique without regard to case (SPSS, Stata)? | (b), and yes to case | Analysis scripts get written against headers that can collide | B1-12 |
| D10 | **Integer ids.** `units`, `unit_values`, `unit_versions`, `coder_sessions`, `session_devices`, `links`, `design_versions` are 32-bit; a refused import burns ids | (a) `bigint` for those and every column referring to them; (b) leave, with B1-21 fixing the burn | (a): free today, a rewrite of the largest tables later. JSON numbers stay safe below 2^53 | 2 billion per table for good | B1-06 |

### API

| # | Decision | Options | Recommendation | If not decided | Items |
| --- | --- | --- | --- | --- | --- |
| D11 | **API renames** of old-model names: `SetProgress.set` → `loop`; `SourceStatus.mode fixed/dynamic` → `queue: own/shared`; role columns `group` (paths, recipe) → `column`; field type `unit_type` → `test_set`; `Recipe.publish` → `deploy`; `CoderProgress.special` → `testUnits`, `finished` keyed by loop title → `[{ loop, title, units }]`; error code `codebook_changed` → `design_changed`; `/study` vs `/studies`; `:id` vs `:studyId` | (a) all; (b) all but the path changes (`/study`, `:id`); (c) none | (b) | The glossary's "known mismatches" become permanent API | B1-14 |
| D12 | **API stability rules.** No version in the path; 16 endpoints return bare arrays (no room for paging); two error-body shapes; `PUT /study/:id` merges some fields and resets `archived` | (a) keep `/api`, document it as v1 ("fields and enum values may be added; breaking changes get a new prefix"); wrap lists in objects (`{ units, next? }`) for units, coders, devices, links, design versions, admin users and studies, with optional `after`/`limit`; one error shape `{ error: string, code?, issues? }`; PUT replaces what is sent and keeps what is left out; (b) also move to `/api/v1`; (c) leave | (a) | Paging can't be added later without breaking R and Python clients; scripts parse two error shapes | B1-01, B1-15 |
| D13 | **Coder links carry the study's sequential id** (`/code/<studyId>?link=…`, API `/d/<studyId>`): studies can be counted and probed, and "one deployment per study" is in every printed link | (a) an opaque public id (random, 10+ characters, a column on `studies`) in coder URLs and the coder API; (b) keep, and say "one study, one deployment" is the product | (a) | Links sent to panels can never change | B1-17 |
| D14 | **API keys and the admin role.** Keys have no second factor and no expiry, yet act as admin (block users, open registration, move owners) | (a) a key acts as `researcher` at most; (b) leave | (a) | An admin's leaked key is a server takeover | B1-19 |

### Behaviour

| # | Decision | Options | Recommendation | If not decided | Items |
| --- | --- | --- | --- | --- | --- |
| D15 | **A login is attached to a coder session without asking.** A logged-in researcher who opens any coder link gets their email stored on that session; a second anonymous or panel link in that browser joins the first session (wrong panel id on the answers) | (a) attach only where the link requires sign-in or the coder clicks "sign in"; (b) leave and document | (a) | Wrong ids in pilot data; emails where the docs say there are none | B2-04 |
| D16 | **Caps on open links.** With `x-new-session` one participant can make thousands of sessions and fill a crowd study; the new-session limit is skipped by sending any device cookie | Caps: sessions per coder id per study (suggest 5); new sessions per address (suggest 60 an hour, counted where the session is made) | Both, with those numbers, as settings | One panel participant can close a study to everyone else | B1-22 |
| D17 | **Abandoned leases** are never deleted and are read on every pick. Deleting them changes what a returning coder gets (an expired lease is still "theirs" today) | (a) delete leases of ended sessions and leases expired for more than a day; (b) leave | (a) | Slower picks as a crowd study ages; harmless for a small pilot | B2-03 |
| D18 | **Deletion and email.** Where sign-in is required the coder id is the email: the deletion log keeps it (the docs say "no email"), and the full study export contains every session's `email`, which the researcher API hides | (a) the log stores a hash when the coder id is an address; the export leaves `email` out unless the deployed design requires sign-in; (b) keep both and correct the docs | (a) | The privacy text (D22) can't truthfully say what a deletion removes | B1-23 |
| D19 | **Leader key on non-US keyboards.** The leader is the physical `Slash` key (`keyboard/leader.ts:11`): on QWERTZ/AZERTY that key types `-` or `!`, and the real `/` does nothing. It never times out | (a) accept the typed character `/` as well as the physical key, and drop the leader after 3 seconds; (b) typed `/` only; (c) leave | (a) | German and French coders can't use `/ 8`, `/ 9` as the hint says | B2-13 |
| D20 | **CSV and spreadsheet formulas.** The default download writes coder-typed cells as they are; one starting with `=`, `+`, `-`, `@` runs in Excel. The .xlsx option is safe | (a) raw CSV stays the default; a warning in `README.txt`, in the help and next to the format choice; (b) a tick box "safe for spreadsheets" that prefixes such cells with `'`; (c) both | (a) now, (b) later (additive) | A researcher opening `coders.csv` in Excel runs a coder's formula, unwarned | B2-19 |
| D21 | **Registration for the pilot** and the default plan (20 studies, 200,000 units, 2,000,000 answers per study) | (a) invite-only, smaller defaults for accounts the owner did not invite (suggest 5 studies, 20,000 units, 200,000 answers); (b) by request, as now | (a) until B1-03, B1-21 and B1-22 are in | Any researcher account can stall a shared server | B7-07 |

### Release and legal (the owner's own work; nothing can be generated for these)

| # | Decision | Options | Recommendation | If not decided | Items |
| --- | --- | --- | --- | --- | --- |
| D22 | **Privacy statement, terms, contact, processor agreement.** None exist; the help says "annotinder.com is hosted in the EU" (`help/topics/design-privacy.md:37`), a service that doesn't exist. No procedure for deleting a researcher account; logs kept for ever | For an invite-only pilot: a privacy page (what is stored, the two cookies, retention, contact) and a written manual procedure for account deletion; terms and a processor agreement before strangers register. The worker can draft the page from `docs/coder-identity.md`; the owner and the university's privacy officer approve it | Draft now, approve before the first outside coder | Coders' data is processed with no notice; the false hosting claim reaches ethics applications | B4-06, B7-08 |
| D23 | **LICENSE.** There is none; the welcome page says "open-source" | MIT, Apache-2.0, AGPL-3.0, or a university-required one | The owner's call; AGPL-3.0 if hosted forks should stay open, MIT if AmCAT-style reuse matters most | The code is legally all-rights-reserved | B7-06 |
| D24 | **Merge, version, freeze.** 491 commits on a `claude/…` branch; the hosting guide tells operators to clone that branch; every package is `0.1.0` | Merge to `main`, tag the release (suggest `0.9.0` for the pilot, `1.0.0` when the freeze is confirmed after it), and freeze migrations at that tag | Merge and tag after B1, B2 and B7; pilot databases made before the tag are dropped | Operators install from a branch name; no point from which migrations are append-only | B7-01, B7-10 |
| D25 | **`notes.md` and `docs/philosophy.md`.** Personal notes in pre-redesign vocabulary; an unfinished draft | Remove `notes.md` from the repo (the owner keeps a copy); fold `philosophy.md` into the README and an About help topic, or drop it | Remove both from the release | They ship in a public repository | B4-05 |

Not a choice, but the owner should know: the server takes the client's word
for how a session ended (`POST /end { item }` with any end item's name is
accepted, without answers). Researchers who pay panels on the "complete"
redirect should be told; a server-side check is deferred (section C).

---

## B. The work

Item format: **id · title** · size · group · needs. Then files, problem, fix, verify.

### B1. Release blockers

#### Serial lane (group `serial`, in this order)

**B1-01 · One request parser, one error shape, no 500 on bad input** · M · `serial` (touches every `researcher/*.ts`; run before the server groups start) · D12 for the shape (without it: keep both shapes, do the rest)
- Files: new `server/src/shared/request.ts`; `app.ts:129-139`; `coder.ts:229`; `researcher/admin.ts:141`; the 13 inline `Schema.safeParse(await c.req.json())`; the 15 `Number(c.req.param(...))`.
- Problem: malformed JSON and non-numeric ids answer 500. `onError` reads `err.code`, but drizzle 0.45 wraps driver errors (`DrizzleQueryError`, code on `.cause`), so the 400/409 mapping never fires, and `console.error(err)` logs the SQL with all parameters (answers, emails, key hashes).
- Fix: `parseJson(c, schema)` (400 for bad JSON and for a schema mismatch) and `idParam(c, name)` (400 unless a positive integer in range), used everywhere. `onError` walks `err.cause` for the Postgres code; logs query text and `cause.message`, never `params`. With D12: every 400 is `{ error: string, code?, issues? }`.
- Verify: `VS` with new tests: `POST /api/study` with `{not json` → 400; `GET /api/study/1/design/abc` → 400; a duplicate → 409; a spy on `console.error` sees no parameter values. Run these also with `TEST_DATABASE_URL` (B5-01): the wrapping was reproduced on PGlite only.

**B1-02 · Names: a letter first, no prototype names; lookups safe from `Object.prototype`** · M · `serial`
- Files: `contracts/src/common.ts:9-13` (`SafeNameSchema`), `design/snippets.ts:43`, `design/references.ts` (`buildScope`, ~770), scale item, URL-parameter, snippet and block names; examples and tests that break.
- Problem: a question named `1st` passes validation and is a syntax error in any script; `__proto__` empties `$var`; a template with `[[constructor]]` makes `validateDesignItems` throw, and because `valid` is computed on every read, that study's design list then fails on every request.
- Fix: names match `/^[A-Za-z][A-Za-z0-9_]*$/`, max 64, not `__proto__`, `constructor`, `prototype`. Every place a name from a design indexes a plain object uses `Object.hasOwn` (or a `Map` / `Object.create(null)`); a snippet that is not a string is "unknown snippet". With D9 (case): names unique ignoring case.
- Verify: `VC` with tests for each bad name and for `[[constructor]] [[toString]]` returning issues instead of throwing; `VS`, `VL`.

**B1-03 · Snippets and URL patterns can't stall the server** · M · `serial`
- Files: `design/snippets.ts:51`, `design/layout.ts` (`UnitLayoutSchema`), `design/session.ts:31-68` (`slowPattern`), `server/src/runtime/sessionValues.ts:37`, `server/src/shared/designVersions.ts:64`.
- Problem: (1) snippets that include each other twice expand exponentially (22 levels: 4 MB in 5.7 s; each level doubles), on every design list. (2) `slowPattern` accepts `a*a*a*a*a*b`; matching it on a 256-character value took 86 s. The request is a coder's first, without login; the pattern needs a researcher account. One thread: every study stops.
- Fix: (1) cap the expanded template (200 kB → an issue), snippets per layout (50) and a snippet's length (20 kB); memoise `valid` per `(design version id, revision)` instead of validating on every list. (2) Match URL-parameter and `coderParam` patterns with a linear-time engine: `re2js` (pure JavaScript, no native build) behind one function in contracts (`design/urlPattern.ts`), used by validation ("this pattern is not supported" when it doesn't compile) and by the server's `fits`. Remove `slowPattern`. If the client bundle grows by more than about 100 kB gzipped, load it only in the editor.
- Verify: `VC`: 30 nested snippet levels return an issue within 100 ms; `a*a*a*a*a*a*b` against 256 `a` returns within 50 ms. `VS`, `VL`.

**B1-04 · Design validation: holes that become stored format** · M · `serial`
- Files: `design/variableTypes.ts:21`, `design/unitLoop.ts:67,94`, `design/validation.ts:394-437,584`, `design/shownFields.ts:27,81`, `design/highlight.ts:18-21`, `design/references.ts:843`, `design/coderCodebook.ts:66,76`, `study.ts:27-36`, `unitFields.ts:29,131-143,191,234`.
- Problem and fix, one test each:
  1. `questionStyle` skips the CSS allow-list (`position: fixed`, `url()` pass): apply `styleProblems` as for a layout's `style`.
  2. `confirm` is in `CHECKABLE_TYPES`, but a confirm answer has no values: a gold check on it always fails (coders screened out), a practice check with retry can't be passed. Remove it.
  3. `practiceCheck.message` is a template nobody validates, and its `$unit` fields are not sent: `checkTemplate` it and add it to `loopReferences`.
  4. A loop's own `condition` is not a dependency (`loopDependencies`), so its question isn't frozen: include it.
  5. A URL parameter's `default` is not checked against its `pattern`; `highlight.fields` not against the layout: check both.
  6. `$var.<scale>.values` drops unanswered items, so positions no longer match items: push `null` (and fix the doc row in B4-07).
  7. `StudyWriteSchema.redirectUrls` takes any scheme (`javascript:`; only the CSP stops it): require `^https?://`. Client half in B1-28.
  8. Unit field names: `UnitFieldSchema.name` is any string, the same name twice passes in a design or recipe: put `UNIT_FIELD_NAME` and uniqueness in `UnitFieldSchema`/`UnitsSpecSchema`, check names in `fieldsOfUnits`.
  9. CSV type inference turns `"01234"` into `1234` and a 19-digit id into a rounded number: infer `number` only when the text round-trips (`String(Number(v)) === v`, safe integers).
  10. The coder codebook carries editor-only `label`s (branch, loop, layout: "Screen-out") and all of an experiment's condition labels to coders' browsers: strip them in `toCoderItems`.
  11. An unknown item `type` reports only "Invalid input": name the allowed types.
- Verify: `VC`, `VS`, `VL`.

**B1-05 · Answers the server accepts** · S · `serial`
- Files: `design/answers.ts:29-91`.
- Problem: `{ done: true }` without a value is valid for a nominal question; a scale answer with one of two items is valid; a span's `field` isn't checked against the question's fields; duplicate span ids pass. A client can finish units with empty answers.
- Fix: at least one value for single-choice, numeric and text answers; every scale item answered or special; `span.field` in `fields`; unique ids. `skip` answers stay as they are.
- Verify: `VC`; `VS` and `VL` (the fake coder server and fixtures may need real values).

**B1-06 · Schema batch 1: indexes, NOT NULL, bigint** · M · `serial` · D10 for the bigint part
- Files: `server/src/db/schema/*.ts`, regenerate `migrations/0000_init.sql` and snapshots.
- Problem: full scans on common paths (the index list is `0000_init.sql:391-418`); columns nullable "from before this was recorded" though there is no before; emails lowercased in code only.
- Fix: add `unit_versions (study_id) WHERE to_deploy IS NULL`; `annotation_values (unit_version_id)`, `(study_id, id)`, `(design_version_id)`, `(device_id)`; `unit_serves (unit_version_id)`, `(unit_id)`; `unit_leases (session_id)`, `(unit_id)`; `unit_codings (unit_id)`; `coder_sessions (link_id)`. `NOT NULL` for the columns behind `CoderProgress.linkId`/`started`, `LinkResponse.created`, `AnnotationRow.designVersionId` and `DeploymentVersion.client`, after confirming each is always written now (unit answers' `unit_version_id` via a CHECK; null stays where it means something, e.g. coder-level answers have no unit), and the contracts fields lose their `nullable`. `CHECK (email = lower(email))` on `users.email`. With D10: `bigint` for the listed tables and their references.
- Verify: `VS` (includes `migrations.test.ts`); `drizzle-kit generate` reports no changes afterwards; on Postgres, `EXPLAIN` of the unit-version load, the coder-home subquery and `GET /annotations` shows index scans (record in the commit message).

**B1-07 · Schema batch 2: `format_version` on design versions** · S · `serial` · D3
- Files: `db/schema/studies.ts`, `contracts/src/design/designVersion.ts`, `recipe.ts`, `shared/designVersions.ts`.
- Fix: column `format_version integer not null default 1`; in `DesignVersionSchema`; optional in `DesignWrite` and `Recipe.design` (refuse a higher one than the server knows). Also one convention for format markers: the results export manifest gets `format: "annotinder-results-export", formatVersion: 1` like the design file and study export.
- Verify: `VC`, `VS`, `VL`.

**B1-08 · Loops: a stable key** · L · `serial` · D1 · **(unverified: start with the failing test)**
- Files: `design/item.ts:293-300` (`unitLoops`), `design/unitLoop.ts:210`, `server/src/runtime/runtime.ts:781,920-937`, `db/schema/distribution.ts`, `coders.ts` (`assignments`), results, `client/src/lib/admin/exportData.ts`, editor (`lib/design/newItem.ts`).
- Problem: `unit_codings` is rederived when loops change, but `coder_sessions.assignments` and `unit_leases` stay under the old position. Deploying a version with a loop inserted before others is expected to put coders in the wrong loop and a "same as previous" unit list under its predecessor's key.
- Fix: first a server test that redeploys with a loop inserted and shows the wrong assignment. With D1 (a): `name` on `unit_loop` (required, unique, same grammar as B1-02; the editor and recipes generate `loop1`…), and every key listed in D1 uses it; `loop_number` stays in `variables.csv` as an extra column. With D1 (b): `deployErrors` refuses a version whose loop sequence differs from the deployed one while any session has assignments.
- Verify: the new test; `VC`, `VS`, `VL`; `E2E` at the milestone (routes and exports change).

**B1-09 · Strict design schemas** · M · `serial` · D2
- Files: `design/item.ts`, `variableTypes.ts`, `unitLoop.ts`, `session.ts`, `layout.ts`, `options.ts`; `server/examples/*.json`.
- Fix: `.strict()` on every item, variable, loop-units, session and layout schema; `meta: z.record(z.string(), z.unknown()).optional()` on items; messages name the unknown key. Fix whatever the examples and fixtures then show.
- Verify: `VC` (a test with `multipel`), `VS` (`examples.test.ts`), `VL`.

**B1-10 · Option values and reserved unit-field prefixes** · S · `serial` · D6, D7
- Files: `design/options.ts:119-131`, `unitFields.ts:115` (`unitFieldNameError`), `server/src/shared/units.ts` (upload path).
- Fix: D6: refuse `;`, `|`, newlines and a leading `<number>..` in nominal values, max 128. D7: an uploaded column `answer_<x>`/`feedback_<x>` is refused unless `<x>` is a question of the study's design, with a message that says the prefixes are reserved.
- Verify: `VC`, `VS`.

**B1-11 · `VariableValue`: strict, bounded ids** · S · `serial` · D8
- Files: `contracts/src/variableValue.ts`.
- Fix: strict object; `ClientIdSchema` max 64 of `[A-Za-z0-9_-]`; `done` documented ("sent by the client when the unit is finished; not used by the server") or removed per D8.
- Verify: `VC`, `VS`, `VL`.

**B1-12 · Export column names** · M · `serial` (contracts) + hand `exportAnswers.ts`/`exportData.ts`/`exportReadme.ts` edits to `cli-admin` · D9
- Files: `design/validation.ts` (reserved names), `client/src/lib/admin/exportAnswers.ts:225-228`, `exportData.ts:107-120,224-239`, `exportReadme.ts`.
- Fix: validation refuses question names equal to a system column (`unit_id`, `unit_version_id`, `session_id`, `coder`, `email`, `link`, `started`, `last_active`, `ended`, `ended_at`, `first_answer`, `last_change`, `design_version`, `device_id`, `display`, …: take the list from the two header builders and export it from contracts so they can't drift). With D9 (b): derived columns become `q.label`, `q.special`, `q.comment`, `q.json`; scale items may not be named `label`, `special`, `comment`, `json`. `README.txt` gets `export_format: 1`.
- Verify: `VC`; `VL` with `exportData.test.ts` cases for a question named `coder` (refused) and for `a` + `a_label`.

**B1-13 · Rename: `annotinder` → `swipe`, experiment vocabulary** · M · `serial`, all other workers stopped · D4, D5
- Files: repo-wide (contracts `variableTypes.ts`, item schema, client `AnnotinderAnswerField.tsx`, examples, help topics, docs, tests, e2e).
- Fix: one mechanical commit per decision. No alias for the old names.
- Verify: `VC`, `VS`, `VL`; grep shows the old enum value only in the product name.

**B1-14 · Rename: API names** · M · `serial`, all other workers stopped · D11
- Files: repo-wide: contracts `session.ts`, `deployment.ts`, `coder.ts`, `recipe.ts`, `unitFields.ts`, `endpoints/*`; server routes; client; `docs/api/*`; `docs/glossary.md` ("known mismatches" section shrinks).
- Fix: the renames listed in D11, one commit. DB column `grp` → `column_name` only if cheap; otherwise leave the column (internal).
- Verify: `VC`, `VS`, `VL`; the endpoint-table check of `docs/api` (B5-12).

**B1-15 · API: wrapped lists, PUT semantics, lenient response enums, stability note** · M · `serial` · D12
- Files: contracts `endpoints/{researcher,coder,admin}.ts`, the list routes (`researcher/{units,coders,links,design}.ts`, `admin.ts`, coder `listDevices`), `researcher/study.$id.ts:28-34`, client `lib/api/*` and `lib/admin/queries.ts`, `docs/api/README.md`.
- Fix: list responses become objects with optional `next`; `after`/`limit` accepted (server may still return everything below a generous default limit). `PUT /study/:id` keeps `archived` when left out. Response enums (`CoderErrorCode`, `Device.type`, `SessionEnd.outcome`, `ServerWarning.code`, `QuestionAgreement.metric`) are parsed leniently in the client. `docs/api/README.md` states the rules of D12.
- Verify: `VC`, `VS`, `VL`.

**B1-16 · `CoderProgress` and results keyed by loop** · S · `serial` · D1, D11 (done inside B1-08/B1-14 if both are yes; listed so it isn't lost if only one is)
- Files: `contracts/src/coder.ts` (`CoderProgress`), `server/src/shared/progress.ts`, `exportData.ts` (`finished_loop<n>`).
- Fix: `finished: [{ loop, title, units }]`; no title-with-key strings as object keys.
- Verify: `VC`, `VS`, `VL`.

**B1-17 · Opaque public study id in coder links** · M · `serial` · D13
- Files: `db/schema/studies.ts`, `coder.ts:111-116`, `runtime/registry.ts`, `shared/links.ts`, contracts `coder.ts`/`endpoints/coder.ts`, client `pages/CodePage.tsx`, `lib/session/studies.ts`, link builders in `components/admin/links/*`, study import (a new id on import).
- Fix: `studies.public_id` (random, unique, made at creation); `/code/<publicId>` and `/d/<publicId>/…`; previews `<publicId>.preview`. The researcher API keeps the numeric id.
- Verify: `VS`, `VL`; `E2E` at the milestone.

#### Server, parallel

**B1-18 · Account linking needs a provider migration, a fresh login and a free slot** · M · `srv-login`
- Files: `researcher/login.ts:32-34,84-91,139-149`, `shared/accounts.ts:184-199`, `docs/security.md` (hand the line to `docs`).
- Problem: `GET /api/auth/login?link=1` needs only a session cookie. Whoever holds a researcher's cookie or unlocked browser logs in at the provider with their own account and second factor: their identity now belongs to the victim's user for good, with a fresh 2FA session, and the victim's email is overwritten. This bypasses step-up.
- Fix: allow linking only while `server.login.previous` is configured and the session's `issuer` is the previous provider; refuse if the user already has an identity at the current issuer; require a fresh login on the starting session; send `prompt=login`. Same file: build the link-failed redirect with `back()` (today `returnTo=/%09/evil.example` passes `safeReturnTo` and resolves to another host: an open redirect); `ANNOTINDER_ADMINS` requires `emailVerified` always.
- Verify: `VS` with `login.test.ts` cases: link without a previous provider → refused; with a stale session → step-up first; a second identity at the same issuer → refused; `returnTo` with a control character → `/`.

**B1-19 · Step-up covers every change of who is admin; API keys are not admins** · S · `srv-login` · D14 for the key part
- Files: `researcher/admin.ts:285-298,310-354`, `researcher/auth.ts:66-70`.
- Problem: `POST /admin/users { email: <an admin>, role: "researcher" }` removes an admin without `checkSensitive` (only granting is checked), also with an API key; blocking an admin and `restoreRoles` aren't sensitive either.
- Fix: one helper "this changes who is admin" used by POST and PUT, also for blocking an admin and restoring an admin role. With D14: a key's role is capped at `researcher`.
- Verify: `VS` (`accounts.test.ts`): each path without a fresh 2FA session → 403 `step_up`.

**B1-20 · Body limits per route** · S · `srv-app`
- Files: `app.ts:151-154`, `coderAccount.ts:40-46` (hand to `srv-runtime`: nothing to change there once the limit exists).
- Problem: 256 MB applies to every `/study/*` route (design saves, sets, `from-recipe`), each read whole with `c.req.json()`; `/coder/*` has no limit at all.
- Fix: 256 MB only for unit uploads, study import and `from-recipe`; 4 MB for other `/study/*` routes; 64 kB for `/coder/*`.
- Verify: `VS` (`app.test.ts`): 413 `request_too_large` on a 5 MB design save and a 100 kB `PUT /coder/settings`.

**B1-21 · Study import: validated, bounded, linear** · L · `srv-export`
- Files: `researcher/studyExport.ts:17-31`, `shared/studyExport.ts:135-211,218-365`, `shared/deployments.ts:196-218`.
- Problem: `POST /study/import` (any researcher) copies rows into the real tables. (1) Designs and the deployment are not validated, and the runtime loads a deployed design without validating: an import yields a live deployment that never passed the schema, `deployErrors`, the pattern check or the redirect scheme check. (2) `readExport` builds each table with `[...old, row]` (`:208`): quadratic; 100,000 rows block the process for 46 s (measured), a 1M-answer study for over an hour. (3) New ids are taken from the sequences before the limits are checked: a refused import burns up to millions of ids. (4) `coder_sessions.assignments[loop].units` is not renumbered. (5) `exportStudy` builds one string and `gzipSync`s it: a study near the answer limit passes Node's string limit and fails **(unverified at size)**.
- Fix: `push`; count rows against the limits before taking ids; validate every design version with the editor's schema and the deployed one with `deployErrors` (refuse the import otherwise); renumber `assignments.units` and `ended.unit`; parse line by line, yielding to the event loop every few thousand lines; stream the export through gzip instead of one string. If streaming the import doesn't fit the night, state the supported size (rows and MB) in the refusal message and in `docs/hosting.md`.
- Verify: `VS` (`studyExport.test.ts`): a 50,000-row import finishes under 5 s; an import over a limit leaves the sequences where they were; an import with an invalid deployed design → 400; a "same as previous" loop keeps its unit list after import.

**B1-22 · Rate limits that can't be stepped around; session caps** · M · `srv-app` (limits) + hand `runtime/store.ts:704-727` cap to `srv-runtime` · D16 for the numbers
- Files: `app.ts:159-172`, `shared/rateLimit.ts`, `runtime/store.ts`.
- Problem: the new-session limit applies only without a device cookie (send any cookie to skip it); with `x-new-session: 1` a known coder id gets unlimited sessions that don't count toward `maxCoders`; the researcher limit is keyed by a hash of whatever `Authorization` was sent, so a new bogus bearer per request is never limited and adds a row each time.
- Fix: count new sessions where they are created, per address; cap sessions per coder id per study; limit the researcher API per address before authentication and per user id after it.
- Verify: `VS`: 400 session starts with a made-up device cookie → 429 before the cap; a sixth `x-new-session` for one coder id → 403 with a code; 1,000 requests with distinct bogus bearers → 429 and no growth of `rate_limits` beyond one row per address.

**B1-23 · Deleting data removes it everywhere** · M · `srv-export` · D18 for the log and export parts
- Files: `shared/coderDeletion.ts:45`, `shared/resultsExport.ts:187-207`, `researcher/study.$id.ts:43-47` (hand to `srv-data`), `shared/studyExport.ts:135-169`.
- Problem: the cached results zip (`exports/<studyId>/<stamp>.zip`) is removed only by the next export: after a coder or the whole study is deleted, the file with their answers stays on disk and an issued download link works for its hour. Where sign-in is required the deletion log keeps the email.
- Fix: remove `exports/<studyId>/` on coder deletion, answers reset and study deletion. With D18: hash the coder id in the log when it is an address; leave `email` out of the study export unless the deployed design requires sign-in.
- Verify: `VS` (`resultsExport.test.ts`): export, delete a coder, the file is gone and the old token answers 404.

**B1-24 · Coder routes look up the link before loading a study; status doesn't explode** · M · `srv-runtime`
- Files: `coder.ts:50-52,71,111-116`, `runtime/registry.ts:29-54`, `runtime/preview.ts:105-107`, `runtime/runtime.ts:1296-1308`, `shared/coderStudies.ts:14-20` (hand to `srv-data`).
- Problem: (1) the runtime for `/d/<id>/…` is loaded before the link, device or preview token is checked: counting up ids loads every study's unit ids into memory for 6 hours, with no cap; a preview path re-reads the draft spec on every request, token or not; the error texts tell which ids exist, are deployed or suspended. (2) `status()` does `row.unitIds.push(...pool.unitIds)` per coder: 500 coders × 50,000 units appends 25M ids on every `GET /deployment/status`, and the spread throws `RangeError` above about 125,000 units. (3) The coder home's subqueries filter `annotation_values` by `session_id` only: a scan of the whole table per session.
- Fix: (1) one indexed lookup of link secret, device key or preview token first; load the runtime only on a hit; cap loaded runtimes (evict the least recently used); one 404 body for "nothing here". (2) per row a `Set`, each share's units added once. (3) add `study_id = coder_sessions.study_id` to both subqueries.
- Verify: `VS` (`coder.test.ts`): a request without a valid link leaves the registry empty; a status test with 200 coders in one share and units in two shares gives the same numbers as before, under 200 ms.

#### Client, parallel

**B1-25 · Retry repeats the failed step, not the next one; Next can't crash** · L · `cli-manager`
- Files: `studyManager/StudyManager.ts:426-465,508-530,592-595,794-815,847-852,1161-1198,1210-1230,1272-1279`.
- Problem (each reproduced by the reviewer against the real class and the fake server): `retry()` re-runs a closure that already moved `topIndex`/`loopIndex`. (a) `assignCondition` fails → Retry skips the experiment; the branch on its condition is evaluated as false and the coder answers without a condition. (b) `POST /end` fails for an `end` item in a loop → Retry opens the next unit: a coder who should be screened out continues. (c) After a failed Back/Next/jump, Retry returns at once (`canGoBack` is false in the error phase): stuck until a reload. (d) `maxReachedTopIndex` is an index into `topSteps`, which shrinks when a changed answer hides a branch: Next then reaches `topSteps[n] === undefined` → TypeError, and Retry repeats it.
- Fix: commit the position only once the step is published (compute the target, do the calls, then set the index); `reachEnd` registers its own retry; a failed navigation restores the position and re-publishes the step the coder was on; "furthest reached" is kept as an item (name or loop key), recomputed in `refreshTopSteps`.
- Verify: `VL`: tests per operation: failing `assignCondition`, `endSession` (top level and in a loop), `getNextUnits` on entering a loop, `getLoopUnit` on going back, `jumpToPhase`, each followed by `retry()`, asserting the position and the server calls; the `q1, branch(q2, q3), q4, q5` scenario for (d).

**B1-26 · Drafts per unit; a new design version keeps every unsaved answer** · M · `cli-manager`
- Files: `studyManager/unitDraft.ts`, `StudyManager.ts:347-377,824-839,1040-1059,1258`.
- Problem: one draft per session: a coder halfway unit 2 who changes an answer in unit 1 loses unit 2's draft (it is replaced, then cleared when unit 1 is saved). On a design update `carryOver` is read only for units that come from `getNextUnits` (`pushFetchedUnit`); a finished unit reopened through `openEntry` takes the server's answers, so a change whose save was refused with "design changed" is lost without notice, and in `pushFetchedUnit` the server's stored answers override the carried ones. (Since `ea26aa5` the change is posted at once, so this needs a redeploy between the change and the post.)
- Fix: drafts keyed `<loop>/<unitId>` (a small map per session; no draft for a `done` unit); `openEntry` applies `takeCarryOver` too; carried (newer) answers win over the server's; a carried finished unit is saved again after the reload; every history entry that is unfinished or unsent is carried.
- Verify: `VL`: new `unitDraft.test.ts`; tests "edit unit 1 while unit 2 is half done, reload" and "change a finished unit's answer while a redeploy is pending".

**B1-27 · Answers that depend on a removed span don't lock the coder out** · M · `cli-manager`
- Files: `StudyManager.ts:692-700` (`postedCoderValues`), `refreshLoopSteps`, `fakeCoderServer.ts`; server rule at `runtime/runtime.ts:1132`.
- Problem **(client side reasoned, server side verified)**: the server refuses a relation whose spans are missing, and an options-from-spans answer whose span is gone, with 400. The client validates only when a unit is opened. Delete a span that a relation uses, press Done: the unit (posted at once if it was finished) is refused, the outbox stops, the error screen's Retry sends the same body for ever. Same at coder level after a design update: every post carries all stored answers, the invalid ones too.
- Fix: after a span answer changes, run the dependent answers through `validateAnswer`/`relationErrors` and drop or re-ask the invalid ones; `postedCoderValues` leaves out answers that fail `validateAnswer`; a save refused with 400 offers "go back to the unit" next to Retry. The fake server validates posts with contracts `validateVariables`.
- Verify: `VL`: the span/relation scenario ends with a saved unit.

**B1-28 · End-screen redirect: http(s) only** · S · `cli-runner`
- Files: `lib/components/SessionEnd.tsx:51-54,80-82`.
- Problem: `window.location.assign(redirect)` and `<a href>` with a URL from a study setting; server half in B1-04 (7).
- Fix: follow and link only `http:`/`https:` URLs (parse with `new URL`); otherwise show the end text without a redirect.
- Verify: `VL`: a `SessionEnd` test with `javascript:alert(1)`.

**B1-29 · The editor can remove a setting; JSON views accept layout items** · M · `cli-editor`
- Files: `lib/design/itemEdit.ts:341-364` (`updateItem`), `designEditor/useDesignDraft.ts` (`update`, `revertItem`), `lib/design/itemShape.ts:7`, `lib/design/itemJson.ts:25`, `DesignJsonEditor.tsx:88` (`carryKeys`).
- Problem (both reproduced): `updateItem` returns `{ ...node, ...updated }`, so a key the form removed comes back: the session title can't be emptied, "coders can add a comment" and a loop condition can't be unticked, an end item's redirect, an instruction, the last snippet, highlights, the last URL parameter can't be removed, and a key deleted in an item's JSON returns. `ITEM_TYPES` lacks `"layout"`: every edit in the whole-design JSON view of a design with a unit loop is dropped ("Not applied"), and a layout's `style`, which exists only in JSON, can't be set anywhere.
- Fix: `updateItem` replaces the item (keeps `_key`, and `children` when `updated` has none); `revertItem` loses its explicit clearing; add `"layout"` (no name needed) and give layouts a place-based id in `carryKeys`. One `withOptional(obj, key, value)` in `lib/design` replaces the eight hand-written "delete if undefined" helpers.
- Verify: `VL`: a test per form path ("removing X removes it": session title, comments, loop condition, redirect, instruction, snippet, highlights, URL parameter, JSON key); a JSON-view test that edits a design with a layout item. Browser-level test in B5-10.

### B2. Correctness bugs

#### Server

**B2-01 · Two first requests don't make two sessions; old logins end** · S · `srv-runtime` (first half), hand the second to `srv-login`
- Files: `runtime/store.ts:196-208`; `researcher/login.ts:160`, `shared/sessions.ts`.
- Problem: no lock per device key between "no session" and the insert: two parallel first requests orphan one session and count the link twice. Every login adds a session row; the replaced one stays valid for 14 days and expired rows are never deleted.
- Fix: an advisory lock on the device key (or the link) around find-or-create; delete the session of the cookie being replaced; sweep expired rows at login.
- Verify: `VS`; the parallel case in B5-01.

**B2-02 · Rederiving codings in batches** · S · `srv-runtime`
- Files: `runtime/store.ts:379-385` (`replaceCodings`).
- Problem: one insert per coding in one transaction; after a redeploy that changes a loop's questions, or a reset, 300,000 codings are 300,000 round trips while every coder request of the study waits.
- Fix: insert in chunks of a few thousand with `unnest`.
- Verify: `VS`: a test with 20,000 codings and a time bound.

**B2-03 · Leases are cleaned up** · S · `srv-runtime` · D17
- Files: `runtime/store.ts:543-552` (`putLeases`).
- Fix: delete leases of ended sessions and leases expired for more than a day when leases are written.
- Verify: `VS`: the end-to-end lease test of B5-04.

**B2-04 · A login joins a coder session only when asked** · M · `srv-runtime` · D15
- Files: `coder.ts:141-158`, `runtime/store.ts:199-203,667-684`, client `studyRunner/SessionNotices.tsx` (hand to `cli-runner`).
- Fix: attach the login's email only where the invite requires sign-in or the request carries an explicit "use my account"; never merge a second link's session into the first because of a login alone.
- Verify: `VS`: a logged-in request on an anonymous link stores no email; two panel links in one browser give two sessions.

**B2-05 · Small server fixes** · S · `srv-login`
- Files: `researcher/auth.ts:38-42,195,205`, `researcher/admin.ts:270-277`, `shared/securityLog.ts` callers.
- Fix: the suspended-study exception lets only `DELETE` through (today also `PUT`); 404 for both "no such study" and "no role"; escape `%` and `_` in the admin `q` filter; write `security_log` rows for API key creation and revocation, study deletion, answer resets and study-user changes (its doc comment says it does).
- Verify: `VS`.

**B2-06 · Small data-path fixes** · S · `srv-data`
- Files: `shared/units.ts:227`, `shared/recipes.ts:66-68`, `researcher/units.ts:62-65`.
- Fix: `removeUnit` includes the study in its delete; the recipe's duplicate-id check uses a `Set` (today quadratic, before any limit); `GET /units` selects the hash only instead of shipping every unit's data to Node.
- Verify: `VS`.

**B2-07 · The pool survives a database restart; time limits on statements** · S · `srv-app`
- Files: `db/index.ts:43`.
- Fix: `pool.on("error", …)` (without it an idle connection dropping ends the process); `statement_timeout` (60 s) and `idle_in_transaction_session_timeout` (60 s) as pool options, with the export and import transactions exempt.
- Verify: `VS`; by hand on Postgres: restart the database under a running server.

#### Coding client

**B2-08 · Practice: a wrong answer can't be passed with Next** · S · `cli-manager`
- Files: `StudyManager.ts:441-457,640,708-743`; `StudyRunner.tsx:288` (hand to `cli-runner`).
- Problem: the wrong answer is stored before the check, so Next (button, Ctrl + →) moves on and the unit is saved with it; `practiceWrong` is matched by question name only, so the same-named question of another unit shows "Not quite".
- Fix: a question with an open `practiceWrong` doesn't count as answered; clear `practiceWrong` when another step is published; match on unit id + question.
- Verify: `VL`.

**B2-09 · Outbox: finished units survive a closed tab; clear during a send** · M · `cli-manager`
- Files: `studyManager/outbox.ts:60-72`, `StudyManager.ts:1069,1111,1193`, `studyRunner/hooks.ts:54-61`.
- Problem: finished units waiting to be sent exist only in memory: a coder on a bad connection whose tab is discarded (phones) loses them. `drain` does `await items[0].send(); items.shift()`: after a `clear()` during the send, the `shift()` drops a new item unsent. Quit, an end and an experiment wait for ever while offline, with a disabled button and no text.
- Fix: persist unit posts in localStorage per session (they are idempotent upserts) and re-send on start; remove the sent item by identity and give `clear()` a generation the loop checks; "Waiting for the connection…" in the Quit dialog and on the end step; the "Not saved yet" notice says how many units wait.
- Verify: `VL`: new `outbox.test.ts` (replace by key while sending and while backing off, `clear()` during a send, `flush()` with an error, order, restore from storage).

**B2-10 · `StudyManager` can be disposed** · S · `cli-manager`
- Files: `studyManager/timing.ts:31-33`, `useStudyManager.ts:8`, `StudyManager.ts:1155`.
- Fix: `dispose()` removes the `visibilitychange` listener and the outbox timers; the hook calls it on cleanup; `endedByServer` awaits `publishEnding` inside the guarded queue instead of `void`.
- Verify: `VL`.

**B2-11 · Keyboard: scrolling, menus, IME** · M · `cli-runner`
- Files: `keyboard/KeyboardProvider.tsx:59-62`, `keyboard/hooks.ts:85-89,248-249`, `keyboard/focus.ts:74`, `CodingNav.tsx:68-70`, `QuitMenu.tsx:40,123`, `studyRunner/{TransferMenu,CoderSettingsMenu,KeyboardMenu}.tsx`, `answerFields/TextAnswerField.tsx:25-31`, `answerFields/SpanManageLabels.tsx:43-56`.
- Problem: every repeated key outside a text field is `preventDefault`ed: holding ↓, Space or PageDown doesn't scroll a long unit. With the Quit dialog, transfer, settings or keyboard menu open, `1`–`9`, the arrows (swipe) and Ctrl + Enter still answer the question behind it. Enter that confirms an IME composition submits a text answer. Number keys in the span menu ignore "Answer with keys: off".
- Fix: prevent a repeat only when the first press was handled; ↑/↓ scroll when focus is not on an answer target; `useMenuKeys(open)` moves to `keyboard/hooks.ts` and is used by every popover and dialog of the coding screen (or once in the `ui/popover` and `ui/dialog` wrappers: then hand to `cli-admin`); check `e.nativeEvent.isComposing`; the span menu respects the setting.
- Verify: `VL` with DOM-level keyboard tests (B5-08 lists them); `E2E` at the milestone.

**B2-12 · Phone and touch** · S · `cli-runner`
- Files: `pages/CodePage.tsx:31`, `SwipeCard.tsx:105-117,208-211`, `DockedAnswerPane.tsx:123-126`, `answerFields/NumericAnswerField.tsx:139-166`.
- Fix: `h-dvh` with `h-screen` as fallback (the answer buttons can sit under the mobile browser's toolbar); a pointerdown on the pane's resize handle doesn't start a swipe (dragging it up 120 px answers a three-option swipe question); the swipe captures its question at the start of the gesture and cancels its 220 ms timer on unmount; a slider's middle value can be chosen by tapping the thumb.
- Verify: `VL`; the phone specs at the `E2E` milestone.

**B2-13 · Leader key by typed character, with a timeout** · S · `cli-runner` · D19
- Files: `keyboard/leader.ts:8-14`, `keyboard/controller.ts`.
- Verify: `VL`: `/` typed as Shift + 7 (code `Digit7`) leads; `/` then `8` after 4 s types 8.

**B2-14 · Smaller coding-screen fixes** · M · `cli-runner`
- Files: `display/hooks.ts:16,60-61`, `TemplateMarkdown.tsx:44,90`, `StudyRunner.tsx:199-205,358,382`, `RelationArrows.tsx:49-93`, `App.tsx:166`, `SandboxedHtml.tsx`, `context/coderSettings.ts`, `answerFields/SpanListRow.tsx:49`.
- Fix: measure the width before the first display entry (today every desktop coder is recorded "narrow", then "wide" 3 s later); links in unit and question text open in a new tab with `rel="noopener noreferrer"`; the unit's content mounts once (derive the animation key from the unit id during render); arrows re-measure only when relations or size change; `useResearcherState` only under the research routes (coders' pages call `getMe()` and get a 401 today); blank an `::html` frame after its first `load` so unit HTML can't navigate it; one localStorage naming scheme, `annotinder:<name>`, for `annocate_theme`, `annocate_show_shortcuts`, `annocate_docked_pane_height`, `annotinder_key_mapping`, `annotinder_answer_keys` (renaming after release loses coders' settings); `py-0.2` is not a Tailwind class.
- Verify: `VL`.

#### Admin client

**B2-15 · Deploy: errors show, no double click, Settings value kept** · S · `cli-admin`
- Files: `DeployPage.tsx:114,121-132`, `DeployPanel.tsx:70,79-91,139`.
- Problem: the panel is keyed on `candidate.revision`; saving the (prefilled, so nearly always changed) note bumps the revision, the panel remounts while `deploy()` awaits: a refused deploy shows nothing and the button is enabled again. The first deploy overwrites "When coders finish" set in Settings.
- Fix: key on the version id only (or lift deploying/error state into `DeployPage`); initialise from `study.reopenMinutes` when set; unique React keys for unnamed items.
- Verify: `VL`: new DeployPage tests (note changed + deploy refused shows the error; first-deploy settings).

**B2-16 · Editor: unsaved edits and backups are not lost** · M · `cli-editor`
- Files: `DesignManager.tsx:63-71,86,190-209,231-234,265`, `designEditor/useDesignDraft.ts` (backup effect ~130-141), `lib/design/localBackup.ts`, `AdminApp.tsx:157,459` (hand to `cli-admin`).
- Problem: while the open version is the live one, a draft created elsewhere (a colleague, an upload in another tab) changes `currentId` on refetch: the editor remounts, edits gone, no dialog. A backup restored onto a version that is no longer current renders read only; onto a deleted one, "Loading design..." for ever. Opening the editor without "Continue editing" deletes the backup the banner still offers. One backup for the whole browser: editing study B overwrites study A's.
- Fix: pin the open version while dirty and offer the conflict dialog's two choices; restore onto the current draft; render the query's error; clear only a backup this mount wrote; ask before replacing dirty edits; backups keyed by study.
- Verify: `VL`: new `useDesignDraft` tests (B5-09) and DesignManager cases.

**B2-17 · Units upload: failure half way, role columns** · S · `cli-admin`
- Files: `units/UploadUnits.tsx:93-123`, `lib/admin/csv.ts`.
- Problem: batches of 200 without try/finally: a failed batch leaves a partial upload, a stuck "Uploading 400 / 1000..." and an unhandled rejection. Uploading a role column replaces it for units not in the file (50 new units with a `coder_set` column drop everyone else's), said only in small print. A semicolon-separated file parses as one column with no hint.
- Fix: try/catch/finally, show the error and how many were uploaded; before upload say "N units not in this file lose their <column>" with a count; detect `;` as separator and a stray quote and say so.
- Verify: `VL`: `csv.test.ts` cases (CRLF, quoted newline, BOM, semicolons, stray quote, ragged rows, duplicate headers); an upload test with a failing third batch.

**B2-18 · Results and units views** · S · `cli-admin`
- Files: `results/UnitsView.tsx:120,179-181`, `units/UnitsPage.tsx:639`, `units/CodersDialog.tsx:146-152`, `lib/admin/xlsx.ts:25`, `lib/admin/designImport.ts:74-80`, `lib/admin/queries.ts:454`, `account/AccountMenu.tsx:130`.
- Fix: relation answers go through the spans map (today raw span ids, always "Coders differ"); a unit whose loop is not in the deployed design shows a message, not "Loading…" for ever; the unit dialog renders list fields as the table does (today "[object Object]"); the "to code" number applies on blur or Enter (clearing the field sets 0 and drops the coder's units); clamp `offset` and prune `selected` after deletes; `isNumber` refuses exponents ("1e5" is text); read an export's first line with a streaming gunzip; `active` is never defaulted to `true` when the deployment isn't cached; `setupUrl` opened only if `https:`.
- Verify: `VL`.

**B2-19 · CSV formulas: warn** · S · `cli-admin` · D20
- Files: `lib/admin/exportReadme.ts`, `results/DownloadView.tsx:41,158-193`, help `results.md:29` (hand to `docs`).
- Fix: README and the format choice say that CSV cells are written as typed and that Excel is the safe choice for opening in a spreadsheet; the file list names `display_changes.csv` and `reset_answers.csv`.
- Verify: `VL`: an `exportData.test.ts` case with a cell starting with `=` pins the raw behaviour.

### B3. Readability refactors

Moves only. Per group in this order; stop where the night ends.

**B3-01 · `runtime/runtime.ts` (1,390 lines, one class) into modules** · L · `srv-runtime`
- Split: `runtime.ts` stays the facade (`load`, `refresh`, `applySpec`, `applySets`, one-line public methods); `shares.ts` (`Share`, `Route`, `shareOf`, test-unit sets, `routeUnits`, `expectedUnits`: pure); `experiments.ts` (`assignCondition`, draws, with `draws.ts` merged in); `picking.ts` (`pick`, `pickShared`, the waiting queue, `pools`); `submit.ts` (`submitUnit`, `submittableLoops`, `goldHealth`); `coderUnit.ts`; `sessionEnd.ts` (`endSession`, `reopen`, `quitSession`); `status.ts`; `transfers.ts`. Then the long functions: `pick` → `pickIds`, `dropMissingUnits`, `leasePicked`; `submitUnit` → `validateAnswers`, `versionSeen`, `writeAnswers`, `checkGold`; `assignCondition` → `conditionOptions`, `fixedCondition`, `drawUnderLock`.
- Verify: `VS` unchanged and green after each module.

**B3-02 · `runtime/store.ts` (778 lines) and the coder middleware** · M · `srv-runtime`
- Split: `store.ts` (the interface), `dbStore.ts`, `startSession.ts` (`findOrCreateCoder` → `linkLogin`, `sessionOfLogin`, `openLink`, `countLinkUse`, `createSession`), `db/locks.ts` (every advisory-lock key space: `advisoryLock`, `inTurn`, `lockUnits`, the migration lock id), `shared/annotations.ts` (`writeUnitAnswers`, `recordCodings` from `putAnnotation`). `coder.ts:111-166` → `loadRuntime`, `versionGuard`, `resolveRequestCoder` in `runtime/requestCoder.ts`; one `linkState` query for `/names`.
- Verify: `VS`.

**B3-03 · `index.ts` → `config.ts`; `createApp` as six calls** · S · `srv-app`
- Split: `readConfig(env)` (pure, same error messages) and `describeConfig`; `index.ts` about 30 lines. `app.ts`: `buildServer`, `mountLimits`, `filesRoute`, `serveClient`; imports ordered.
- Verify: `VS` with the new `config.test.ts` (B5-06).

**B3-04 · `researcher/admin.ts` (one 300-line function) by section** · M · `srv-login`
- Split: `admin.settings.ts`, `admin.plans.ts`, `admin.users.ts`, `admin.requests.ts`, `admin.studies.ts`, `admin.log.ts`; queries to `shared/adminQueries.ts`. Load plans, domain rules and settings once per request (today `GET /admin/users` runs 3-4 queries per user for up to 200 users).
- Verify: `VS`.

**B3-05 · `researcher/results.ts` (444 lines), queries out of routes, `assignmentChecks`** · M · `srv-data`
- Split: `shared/results/{answerCounts,agreement,resultUnits,resultCoders,resultsCache}.ts`; routes keep registrations. Queries in `coders.ts:23-42`, `units.fields.ts:53-60`, `sets.ts:11-28` move to `shared/`. `shared/sets.ts:188-281` → `shared/deployChecks.ts` (`coderChecks`, `experimentChecks`, `partChecks`, `unassignedUnits`, `answerKeyWarnings`, each pure).
- Verify: `VS`.

**B3-06 · Small shared helpers on the server** · S · `srv-data` (hand single lines to owners)
- One `sha256Hex` (five copies), `randomToken` (two hand-rolled), `isSecure(c)`, `deployedDesignItems(db, studyId)` (five copies), `firstDuplicate(list)` (six); `coderAccount.ts` uses `loggedIn`; one may-submit rule (`distribution.ts:209-215` is test-only).
- Verify: `VS`.

**B3-07 · `design/validation.ts` (1,036 lines; `semanticIssues` is one 720-line closure)** · M · `serial`
- Split, same exports: `validation/{schemaIssues,context,references,loops,session,walk,questions}.ts`; the `issue()` collector becomes a small `Issues` class passed around. Compute `unitLoops(items)` with paths once (today loops are counted three ways). One branch schema helper `branchOf(childSchema)`.
- Verify: `VC`, then `VS`, `VL`.

**B3-08 · `design/references.ts` (900 lines)** · M · `serial`
- Split along its section comments: `references/{syntax,template,shape,scope}.ts`; `templateFences` to `templateBlocks.ts`; one `forEachTemplateNode` for the three hand-written walks; parse each template once per validation.
- Verify: `VC`, `VS`, `VL`.

**B3-09 · `StudyManager.ts` (1,446 lines, ~70 members)** · L · `cli-manager` · after B1-25, B1-26, B1-27, B2-08, B2-09
- Split (the class stays the facade): `Position.ts` (steps, indexes, furthest reached), `UnitHistory.ts` (histories, `openEntry`, `pushFetchedUnit`, carry-over), `UnitQueue.ts`, `practice.ts` (extended), `stepRenderer.ts` and `navigationSnapshot.ts` (pure), `Operations.ts` (the guarded queue and the rule for Retry), `endings.ts`. `doStart` → `loadSession`, `showEndedSession`, `resume`; `answer` → `answerCoderQuestion`, `answerUnitQuestion`. "In a unit" becomes one object instead of five nullable fields. `QuestionTexts` moves from `components/Question.tsx` to `studyManager/types.ts`.
- Verify: `VL` after each module.

**B3-10 · `StudyRunner.tsx` (`CodingScreen`: 295 lines, nested ternaries)** · M · `cli-runner`
- Split: `CodingScreen` = hooks + `switch (snapshot.phase)`; `studyRunner/{QuestionScreen,UnitQuestionLayout,CoderQuestionCard,SwipeArea,AnsweredQuestion,NewUnitsBanner,PracticeCorrectFlash,CoderSessionGate}.tsx`, `useCurrentQuestion.ts`, `useUnitSlide.ts`; `<UnitFields/>` appears once.
- Verify: `VL`; coding specs at the `E2E` milestone.

**B3-11 · Coding components with long functions** · L · `cli-runner`
- `SelectableText.tsx` (520) → `selectableText/domRanges.ts`, `useMouseSelection`, `useWordCursorKeys`, `<TextSegment/>` with its three marks. `CodingNav.tsx` (491) → `codingNav/{Overview,LoopPanel,CodingProgress,UnitStepper,UnitNumberPad}.tsx`. `SpanAnswerField` → `mode = manage | label | list | idle` and four components. `NumericAnswerField` → `NumberButtons`, `NumberSlider`, `NumberInput`. `ScaleAnswerField` → `ScaleGrid`, `ScaleCompactRows`. `RelationAnswerField` → `RelationTypePicker`, `RelationList`. `SessionNotices` → a table error code → component. `SessionEnd` → `endingText()`. `QuitMenu` → three dialog bodies. `CoderSettingsContext` → `usePersistedSetting`. `keyboard/hooks.ts` `useKeyTargets` → pure `handleLettersKey`, `handleFilterKey`, `chooseByKey`.
- Verify: `VL`.

**B3-12 · Editor forms** · L · `cli-editor`
- `ItemForm` (283) → `QuestionForm`, `ExperimentForm`, `BranchForm`, `LoopConditionField`, `NameField`, `LabelField`, a switch on type. `OptionsEditor` (263) → `OptionRow`, `OptionsFromRow`, `useSwapAnimation`. `LayoutForm` (226) → `SimpleLayoutForm`, `AdvancedLayoutForm`. `VariableTypeForm` → only picks the form; `TextFields`, `SwipeFields`. `RandomConditionFields` → `AssignedSelect`, `ConditionUnitsFields`, `StratifyFields`. `RuleRowEditor` → `RuleArguments`. `ItemPanel`/`ItemPreview` → `ItemPane` by `(pane, type)`, `usePreviewUnit`, `previewLayoutOf`. `TreeItemRow` → `useRowAddOptions`, `itemLabelText`. `TemplateInsertMenu` → sections as data. Nested ternaries in `EditorToolbar` (Save title) and `DesignManager.tsx:63-71,132-139`.
- Verify: `VL`; editor specs at the `E2E` milestone.

**B3-13 · Admin pages** · L · `cli-admin`
- `StudyPreview` (332) → `usePreviewSession`, `PreviewToolbar`, `DeviceFrame`, one `PreviewRunner`. `CoderSetDialog` (~300) → `useCoderSetPlan` and four field components. `StudyList` (285) → `StudyCard`, `CreateStudyDialog`, `DeleteStudyDialog`. `StudyAdminView` (240) → `StudyHeader`, `StudyPage` (a `Record<TabId, …>`), `useSaveBeforeLeaving`. `CodersDialog` → `CoderRow`, `AddCoderForm`. `DownloadView` → `lib/admin/buildDownload.ts` (testable). `UploadUnits.tsx` (639) → `units/upload/` with `useCsvMapping`, `ColumnsTable`, `lib/admin/uploadUnits.ts`. `UnitsPage.tsx` (664) → a file per component. `CodersPanel` → `DeletionRequests`, `CodersTable`. `AnswerKeyDialog` → `useAnswerKeyUnits`, `UnitPager`. `DeployPanel` → `DesignToDeploy`, `UnitsToDeploy`, `FirstDeploySettings`. `FieldsPanel`, `SplitIntoSets`, `ResultsPanel.Summary` (a record instead of a 6-branch ternary).
- Verify: `VL`.

**B3-14 · Shared UI patterns** · M · `cli-admin` · after B3-12 and B3-13 (touches their files: run alone)
- Four hand-rolled modals (`StudyList` twice, `ExamplesDialog`, `ImportStudyDialog`, `UnsavedChangesDialog`: no Escape, no focus trap) → `Dialog`; 23 native `confirm()`/`alert()` → one `useConfirm`; `ui/select.tsx` and `Field`/`CheckField` for 52 raw selects and five copies of `selectClass`; one `MenuPopover`; one `createStore<T>()` for the four module stores; agreement thresholds in one place; contracts `isEmail` everywhere; "Loading…" spelled one way; sentence case ("Create new study"); "designVersions" out of a text shown to people.
- Verify: `VL`; `E2E` at the milestone (specs click these dialogs).

**B3-15 · `coder.test.ts` (3,109 lines) into files** · M · `srv-runtime`
- `coderHarness.ts` plus about ten files along the describes (`coder.flow`, `.sharedQueues`, `.expertCoders`, `.experiments`, `.testUnits`, `.sessions`, `.designUpdates`, `.unitVersions`, `.preview`, `.endItems`, `.deployChecks`).
- Verify: `VS`: the same 207+ tests, by count.

### B4. Cleanup, dead code, docs

**B4-01 · Server: dead code, stale comments, internal names** · S · `srv-runtime`
- Remove: `questions` map (`runtime.ts:214,294`, never read), `Codings.forget`, `lastAt`/`lastFinished`, `UnitPool.canSubmit`, `async` on `shownVersion`, the exports of `exampleTime` and `RESULTS_EXPORT_FORMAT`. Fix comments: `keys.ts:5-6` ("no researcher login yet"), `runtime/types.ts:70,167,220`, `distribution.ts:51,64-68`, `designItems.ts:44-50,62`, `coder.test.ts:157,1573`. Rename internally: "special units" → test units (`SPECIAL`, `specialUnits`, `specialSet`, `specialProgress`), `OverlapPlacement` → `TestUnitPlacement`, `Deployments.refresh` → `bumpRevision`, "codebook" → design in comments.
- Verify: `VS`.

**B4-02 · Contracts: dead code and stale comments** · S · `serial`
- Remove: template kind `"set"` in `checkTemplate`/`checkBlocks` (`validation.ts:257-356`, never passed), `layout?: unknown` in `checkUnitChecks`, the second `ORDER_METHODS`; rename one of the two `sameValue`. Comments: `design/layout.ts:9-10`, `sets.ts:58`, `coder.ts:89-93,112`, `deployment.ts:80,106-121`, `validation.ts:85-97,563`, `unitFields.ts:63-66`, `references.ts:322`.
- Verify: `VC`, `VS`, `VL`.

**B4-03 · Coding client: unused code** · S · `cli-manager` (first line), `cli-runner` (rest)
- Remove: free ("preview") navigation in `StudyManager` (`allowFree`, `allowAhead`, `jumpToUnitQuestion`: called only from tests) with its tests; `totalUnitsInHistory`, `NavigationPhase.type "branch"`, `NavigationUnitItem.externalId`; `initialPendingSpan`/`initialIsViewingAllLabels`; export of `SandboxFrame`; `StudyRunnerProps.onFinished`; rename `StudyRunnerMenuBar.test.tsx` to what it tests; export `TextAnswerField` from `answerFields/index.ts`; the orphan doc comment at `StudyRunner.tsx:444`; coder-facing text of `UnsupportedAnswerField`.
- Verify: `VL`.

**B4-04 · Admin client: unused code** · S · `cli-admin` (hand `lib/design` lines to `cli-editor`)
- Remove: the second navigation row and the `pages` level of `GROUPS` (`AdminApp.tsx:68-80,360-388`); `CreateStudyForm` in `StudySettings.tsx:37-58`; `DeployHistory`'s `limit`; `VARIABLE_TYPE_LABELS`, `shareLabel`, `keepFields` (and their tests); `keys.deploymentStatus`; the `setSession` return of `useDesignDraft`; exports used only in their own file (list in the review: `SharedSettings`, `CsvUpload`, `DeploySettings`, the `*Props` types, `asIs`, `specialText`, `displaySummary`, unused shadcn exports). Comments: `EditorToolbar.tsx`, `exportData.ts:197,207`, `csv.ts:16-18`.
- Verify: `VL`.

**B4-05 · Docs: remove what is done or private** · S · `docs` · D25 for `notes.md` and `philosophy.md`
- Delete `docs/plans/unit-sets.md` and `results-viewer.md` (built; move the "Later: waves" note to `architecture.md` §11 and the "not yet" list to `client.md` §9); fold the built part of `exports-and-files.md` into a short "Exports and files" section of `architecture.md`, keep a stub for S3; trim `design-viewer.md` to the unbuilt viewer; rewrite `docs/plans/README.md`; fix names in `final-answers.md`, `question-loops.md`, `encryption.md`. `security.md` §6 becomes a link to `hosting.md` "Settings" (the settings are listed in four places). Rewrite the design section of `packages/contracts/CONTRACTS.md` from the glossary, or delete the file and point there.
- Verify: `VL` (the help test checks links); grep for links to deleted files.

**B4-06 · Docs: false and stale statements** · M · `docs` · D22 for the hosting claim's replacement text
- `help/topics/design-privacy.md:37`, `architecture.md` §4, `compositions.md`: no "annotinder.com is hosted in the EU". `architecture.md`: "expert coders" (L225), field types (§8.4: `text, number, boolean, list, set, test_set`), frozen answers (§7), pointers to deleted plans. `api/researcher.md`: field types, `listCoderUnits` row, "not deployed", `listDesignVersions` fields, layout items. `client.md`: Ctrl + Enter not Shift + Enter (L315, L345), the `text` type in §4 and §5, `highlight`, `answerKeys`, numeric `is`, `.special` scope. `hosting.md`: the `--branch` note (after D24), Postgres 18 in "Capacity". `release-checklist.md` L62. `coder-identity.md`: typos, the broken line at L229, §6 order, the deletion log (after D18). Help: `coders-and-progress.md:27-33` (the overview's facts card), `design-editor.md:145` (banner text), `results.md` (`_comment` columns). `exportReadme.ts` (hand to `cli-admin`): `_comment`, `loop_number`, `loop`, `type`, `ended_at`, `link`, `device_id`, "units.csv: versions that have answers", the broken sentence at L67.
- Verify: `VL`; B5-12 keeps the labels honest.

**B4-07 · README and repository files** · S · `docs`
- `README.md`: status (pilot), licence (after D23), contact, how to report a security problem, what `docs/plans/` is now. State the versioning rules in one place (`RELEASE`, `DESIGN_FORMAT_VERSION`, `STUDY_EXPORT_FORMAT_VERSION`, the API rules of D12).
- Verify: read-through.

### B5. Tests

Tests named in an item's "Verify" are written with that item. These are the
holes no fix item covers.

**B5-01 · The server suite and concurrency on real Postgres** · M · `srv-runtime`
- `testDb.ts` supports `TEST_DATABASE_URL`; nothing uses it, and PGlite has one connection, so advisory locks and counters have never run concurrently. Add `pnpm test:pg` (the whole suite against a Postgres from the environment) and `concurrency.pg.test.ts` (skipped without the variable): 20 parallel first requests on a link with `maxCoders: 5` → exactly 5 sessions; 20 parallel picks of one name → one winner; 20 parallel balanced draws → balanced; two parallel first requests with one device key → one session (B2-01); 20 coders taking from a shared queue of 30 units with `codersPerUnit: 2` → no unit handed to a third.
- Verify: `docker run --rm -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:18`, then `TEST_DATABASE_URL=… pnpm test:pg`. Fix what it finds as B2 items.

**B5-02 · Postgres error mapping and limits** · S · `srv-app`
- 400 for `22P02`/`22003`, 409 for `23505`, 413 per route (with B1-01, B1-20); the in-memory `coder` rate limit and `trustProxy` (`X-Forwarded-For`, last entry); `answersPerStudy` (`study_full` on submit, count cached a minute) and `answer_too_large`.
- Verify: `VS`.

**B5-03 · Redeploy while coders work** · M · `srv-runtime`
- A loop inserted before another (with B1-08); a submit for a unit version a concurrent deploy deletes (`putAnnotation`'s fallback, `store.ts:490-501`); codings rederived with 20,000 rows and with a failure in the middle.
- Verify: `VS`.

**B5-04 · Leases end to end** · S · `srv-runtime`
- Advance `now` past `leaseSeconds`: the abandoned unit goes to another coder, the first can still submit it, the stored lease row is as intended (and removed per D17).
- Verify: `VS`.

**B5-05 · Status and coder home at size** · S · `srv-runtime`
- `status()` with 200 coders in one share and with units in two shares (with B1-24); an `EXPLAIN` assertion on Postgres that the coder-home subqueries use `annotation_values_coder`.
- Verify: `VS`, `pnpm test:pg`.

**B5-06 · Start-up configuration** · S · `srv-app` · after B3-03
- `config.test.ts`: refusals (dev mode off localhost, missing `OIDC_ACCOUNT_URL`, bad `AUTH_STEP_UP_MAX_AGE`, `OIDC_PREVIOUS_*`, and the production checks of B7-04).
- Verify: `VS`.

**B5-07 · Retry per operation, drafts, dependent answers, outbox** · — written with B1-25, B1-26, B1-27, B2-09 (listed here so the orchestrator checks they exist: one `retry` test per operation kind, `unitDraft.test.ts`, `outbox.test.ts`, the fake server validating posts).

**B5-08 · Keyboard and answer fields at DOM level** · M · `cli-runner`
- `KeyboardProvider` (leader then command, leader in a number box, repeats, Space/Enter on a focused button, text fields), `KeyController` priorities and exclusive scopes, an open menu or dialog blocks answer keys, `useKeyTargets` for the letters and filter mappings. Fields without tests: `NumericAnswerField` (typing, slider keys, step rounding), `ScaleAnswerField`, `TextAnswerField` (Enter, Ctrl + Enter, IME), `RelationAnswerField` with its provider, `SwipeCard` (thresholds, a drag starting in the answer pane), `SessionEnd` (timer, preview, http only), `SessionErrorScreen` per code. Small pure ones: `navigationLabels.ts`, `practice.ts`, `httpCoderApi.ts` headers and error parsing, `session/studies.ts`, `useDisplayLog`.
- Verify: `VL`.

**B5-09 · `useDesignDraft` and the JSON views** · M · `cli-editor`
- The hook has no test: `update` removing a key, save with a revision, the 409 path and "save mine over theirs", save on a live version creating a draft, backup written and cleared, restore, undo grouping. `ItemJsonEditor`; `itemShape`/`carryKeys` with layout and else items.
- Verify: `VL`.

**B5-10 · Browser-level clicking tests for the editor bugs** · M · `e2e` · after B1-29, B2-15, B2-16
- New `editor-edits.spec.ts`, clicking as a researcher: empty the session title and save → it stays empty after a reload; untick "Coders can add a comment"; remove an end item's redirect; delete the last snippet; delete a key in an item's JSON pane; edit a layout's `style` in the whole-design JSON view and see it applied; a refused deploy with a changed note shows its error; undo and redo; the localStorage backup banner (continue, discard); a second browser context saves the same draft → the conflict dialog.
- Verify: `cd packages/e2e && npx playwright test editor-edits` (this spec only; the full suite at the milestone).

**B5-11 · Admin component tests that click** · M · `cli-admin`
- DeployPage/DeployPanel (units-only deploy, `useConfirmedDeploy` decline and accept), UploadUnits (batching, id column, existing and coded units), `buildDownload` (zip contents, CSV vs xlsx, reset on and off), `exportData.test.ts` (a relation's text via the spans map, a unit with two versions coded by one coder, coders whose `finished` keys differ), `xlsx.test.ts` ("1e5", a cell over 32,767 characters, control characters), CodersDialog (rename to a taken name, typing a number), UnitsPage (selection, paging, a list field), results views (relations, a missing loop).
- Verify: `VL`.

**B5-12 · Docs can't drift silently** · S · `docs`
- Tests: every header of every export table appears in `exportReadme.ts`; every bolded UI label in the help topics exists in the client's texts (the grep the reviewer used: 671 labels); every endpoint in the contracts registries appears in `docs/api/*` and the reverse.
- Verify: `VL`, `VC`.

### B6. Benchmark and compute estimate

**B6-01 · Fix the load test's scenario** · S · `bench`
- Files: `packages/server/scripts/load-test.mjs:71`.
- Problem: the design puts the queue on the invite (`invite: { mode: "crowd", share: … }`); the current contracts drop `share` silently, so the script measures "every coder codes all units", and the "Capacity" table in `docs/hosting.md` describes a scenario the script no longer runs.
- Fix: the queue on the loop (`units: { divide: { codersPerUnit: { min: 2, max: 2 } } }`); `MODE=shared | all | experts`; fail loudly if the created design doesn't resolve to the intended mode.
- Verify: a run against `pnpm dev` prints the mode it measured.

**B6-02 · A repeatable benchmark** · M · `bench`
- `SEED` for think times and answers; `STUDIES` (N studies, coders spread over them); throughput (requests/s, units/s) next to p50/p95/p99/max; a probe calling `GET /api/health` every 100 ms (its p95 and max show a blocked event loop); results as JSON (`bench/<date>-<preset>.json`, with scenario, commit and numbers). `scripts/bench.mjs` (`pnpm --filter @annotinder/server bench <preset>`): starts the server with `AUTH_DEV_MODE=1 HOST=localhost ANNOTINDER_RATE_LIMITS=off` on a free port and a fresh `PGLITE_DIR` or the caller's `DATABASE_URL`, waits for health, runs the preset, stops the server.

  | Preset | Database | Units | Coders | Think time | Duration | For |
  | --- | --- | --- | --- | --- | --- | --- |
  | `smoke` | PGlite | 1,000 | 20 | 0.5 s | 20 s | does it run (CI) |
  | `realistic` | Postgres | 10,000 | 500 | 10 s | 5 min | the launch workload |
  | `stress` | Postgres | 10,000 | 500 | 1 s | 2 min | where it saturates |
  | `large-queue` | Postgres | 50,000 | 300 | 2 s | 3 min | the O(units) pick |
  | `many-studies` | Postgres | 50 × 2,000 | 500 | 10 s | 5 min | 50 runtimes in memory |

  PGlite is one connection in WebAssembly: never quote capacity from it.
- Verify: `smoke` passes locally with zero errors.

**B6-03 · A large existing data set** · M · `bench` · after B1-06
- `scripts/bench-seed.sql` (Postgres): after the deploy, `generate_series` inserts 2,000 sessions × 170 units × 3 variables = 1M answer rows, sets `deployments.codings_basis = NULL` and `units.coded = true` (the next request rederives the codings: this times B2-02). Then `realistic`, and one timed call each of `/results/answers`, `/results/agreement`, `/coders`, `/overview`, `/deployment/status`, `POST /results/export`, `GET /export`.
- Verify: the timings are in the JSON.

**B6-04 · Run it and write the estimate** · M · `bench` (hand the text to `docs`) · after B1 and B2 server items
- Run `realistic`, `stress`, `large-queue`, `many-studies` and B6-03 on Postgres 18 on a 4 vCPU machine; keep the JSON in `bench/`. Replace "Capacity" in `docs/hosting.md` with the measured table, the pass criteria (`realistic`: zero errors, submit p95 < 100 ms, next p95 < 250 ms, health-probe max < 250 ms) and the sizing below, corrected by the measurements.
- The estimate to confirm (from the code, for 50 studies, 500 concurrent coders, 1M annotations): 500 coders at 10-20 s per unit are 25-50 submits/s, 40-70 requests/s, 700-1,200 statements/s. **Application:** one process, 2 vCPU, 4 GB (steady state under 1 GB; the rest is for an import, an export or a large upload; set `--max-old-space-size` to the container). **Database:** 2 vCPU, 4-8 GB, 20 GB SSD; about 0.5 GB per million answer rows with indexes (1M finished units of three questions ≈ 1.5 GB), units 1 GB, total 2-4 GB, `shared_buffers` 1-2 GB; `max_connections` above `PGPOOL_MAX` (20). **One machine:** 4 vCPU, 8 GB RAM, 40 GB SSD holds both with headroom. First limits, in order: importing or exporting a very large study (memory), status and results on a very large crowd study, a shared queue near 50,000 units (a turn blocks the event loop 0.3-0.8 s). Request volume is not one of them.
- Verify: the numbers in `hosting.md` equal the JSON.

### B7. Release operations

**B7-01 · Freeze the migrations** · S · `serial` · D24 · the last code change before the tag
- Regenerate `0000_init.sql` once more from the schema; add `migrations.checksums.json` and a test in `migrations.test.ts` that compares each released migration file's SHA-256 with it (an edited, already-applied migration is skipped silently by the migrator: the database drifts with no error). `packages/server/README.md`: from the tag on, only `db:generate`; new columns nullable or with a default; drops one release later; rollback is "restore the dump taken before the update". Earlier `.annotinder.gz` exports are unsupported; pilot databases from before the tag are dropped.
- Verify: `VS`; editing a byte of `0000_init.sql` fails the test.

**B7-02 · CI** · S · `ops`
- `.github/workflows/ci.yml`: on every push, `pnpm -r lint`, the three fast checks, the build, and the bench `smoke` preset; a job with a Postgres 18 service running `pnpm test:pg`; e2e nightly and on release tags.
- Verify: the workflow passes on the branch.

**B7-03 · Secret scan** · S · `ops`
- A gitleaks (or equal) run over the whole history before the repository goes public, and as a CI step. `.env` is ignored and `.env.example` matches the code (checked by the reviewer); this confirms nothing slipped in 491 commits.
- Verify: zero findings, or each one rotated and listed.

**B7-04 · Fail fast on production settings** · S · `srv-app`
- Files: `index.ts:85-86,120` (or `config.ts` after B3-03).
- Problem: with `DATABASE_URL` set the server starts without `ANNOTINDER_SECRET` (a warning only) and with `ANNOTINDER_PUBLIC_URL` falling back to `http://localhost:<port>`.
- Fix: both are errors when `DATABASE_URL` is set and dev mode is off; also refuse a secret shorter than 32 characters.
- Verify: `VS` (B5-06).

**B7-05 · Logging** · S · `srv-app`
- One line per request: method, path **without the query string** (coder links carry the secret and panel ids there), status, duration, a request id that is also in the error body and the error log; no bodies, no parameters (with B1-01). `docs/hosting.md` (hand to `docs`): keep Caddy's access log off or strip query strings; container logs are capped at 3 × 10 MB.
- Verify: `VS`: a request with `?link=secret` logs no `secret`.

**B7-06 · LICENSE, SECURITY.md, CHANGELOG** · S · `ops` · D23
- The licence file and the `license` field in every `package.json`; `SECURITY.md` with a contact; `CHANGELOG.md` starting at the release.
- Verify: read-through.

**B7-07 · Backups, monitoring, defaults: the operations page** · M · `docs` (text) + `ops` (`scripts/db-backup.sh`) · D21
- `docs/hosting.md`: dumps go off the machine and are encrypted (today: unencrypted, same disk, 7 days); a restore drill with its commands; `ANNOTINDER_FILES_DIR` is in the backup; an external uptime check on `/api/health`, a disk-space alert, an alert when `db-backup` logs `ERROR`; retention of `security_log`, `admin_log` and expired sessions; the pilot's registration mode and plan defaults (D21); Cloudflare only as proxy/CDN: the body limit of the plan (100 MB on Free) against the upload limit, and "do not cache `/api`".
- Verify: the restore drill is run once (B7-09).

**B7-08 · Privacy page and account deletion procedure** · M · `docs` + a link in the welcome page footer (hand to `cli-runner`) · D22
- A draft privacy statement from `docs/coder-identity.md` and `help/topics/design-privacy.md`: what is stored for coders and researchers, the two cookies (`annotinder_device` 400 days, `annotinder_session` 14 days; functional, so disclosed without a banner), response times and device type, retention, who the controller and processor are, contact. A written manual procedure for deleting a researcher account (SQL, in `docs/accounts.md`). Marked DRAFT until the owner approves.
- Verify: the owner reads it.

**B7-09 · Checks only a person can do** · — · owner
- Log in with the real provider on the server: a researcher without 2FA, an admin with 2FA, step-up for a sensitive action, coder sign-in on a link that requires it (the tests use a mock issuer only). One restore from a dump onto an empty server. Span selection by tap and by drag on iOS Safari and Android Chrome (`SelectableText.tsx:210-221,284-288` relies on `mouseup` + `getSelection()`; **unverified on a device**; if it fails: `pointerup` + `caretPositionFromPoint`, a `cli-runner` item). The answer buttons visible above the mobile toolbar (B2-12).

**B7-10 · Release** · S · `ops` · D24 · after everything above that is going in
- The full checks once: `LINT`, `VC`, `VS`, `VL`, `pnpm test:pg`, the complete `E2E` suite against an empty Postgres 18, `scripts/smoke-test.sh` against the built image. Merge to `main`, tag, remove the `--branch` note from `docs/hosting.md`, set the release number in the packages.
- Verify: the tag builds and passes CI.

---

## C. Deferred until after the release

Nothing here changes a frozen surface; each is additive or internal.

| What | Why it can wait |
| --- | --- |
| Cloudflare Workers port | 3 to 5 weeks (previews in memory, study import/export in 128 MB, advisory locks through Hyperdrive, a second test target) and a second runtime for good; decided: one EU VM |
| Server-side check of how a session ended (`POST /end` accepts any end item) | Conditions run in the browser by design; a partial check ("the questions before this end have answers") is additive. Tell researchers who pay panels |
| Session list, "log out everywhere", absolute session lifetime | Needs `sessions.last_used` and a label: additive columns. With B1-18 fixed, blocking a user is enough for a pilot |
| Account deletion endpoint; cleanup jobs for logs | A manual procedure is written in B7-08 |
| Per-unit summary for shared queues (a turn reads every coding and scans every unit: 0.3-0.8 s at 50,000 units) | Fine at 10,000 units; internal change; B6 measures it |
| N+1 in `nextUnits` (about 30 round trips per batch of 5), 16 statements per submit, gold health per unit, `routeUnits` rebuilt per call, uploads at three statements per unit | Measured p50 of a submit is 12 ms; internal |
| One definition of "finished" (progress reads `unit_codings`) | A wrong count would be visible to researchers: do it with time to test |
| A cheap stamp for previews (they re-read the whole draft per request) | Slow only near 50,000 units |
| `VariableValue` as a discriminated union | B1-11 keeps it possible (`kind` can be added) |
| Field types `answer`/`feedback` instead of name prefixes | D7 (a) keeps it possible |
| Waves or several deployments per study | D13 (a) keeps links independent of it |
| A "safe for spreadsheets" CSV option | Additive (D20) |
| Drafts or a confirmation for span and relation work lost on navigation | Annoying, not corrupting; needs design |
| Touch targets below 44 px, radio-group semantics, `alt` texts, about 55 unlabelled admin inputs | Accessibility pass after the pilot |
| Preview of a study without units | Matches the help text today; a product choice |
| READ role can make a results download link valid for an hour | Consistent with READ paging through `/annotations`; confirm later |
| Transfer link opened by someone else joins the creator's session | Inherent; a "whose session is this" notice later |
| Error tracker (Sentry or GlitchTip), published image on ghcr.io | Before an open server, not a pilot |
| Several server processes | Built for it, never run; previews and the answer count are per process |
| MCP branch | Its migration must be regenerated after the freeze anyway |
| R and Python clients | After the API rules of D12 are in |
| E2E for login in a browser, the server admin page, API keys, team settings, coder deletion, resets, Firefox and Safari | Server tests cover the API side; B5-10 covers the editor; the rest after the pilot |
| Terms of use and a processor agreement | Needed before open registration, not for an invite-only pilot |
