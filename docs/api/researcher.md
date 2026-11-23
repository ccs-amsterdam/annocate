# Researcher API

Managing studies: designs, units and sets, links, deploying, results. Paths
are relative to `/api`. Called by the researcher UI (`ResearcherApi`), scripts
(R, Python) and other systems (AmCAT).

- Contracts: `researcherEndpoints` in
  [`contracts/src/endpoints/researcher.ts`](../../packages/contracts/src/endpoints/researcher.ts).
- Implementation: [`server/src/researcher/`](../../packages/server/src/researcher/), one file per
  path, with shared queries in [`shared/`](../../packages/server/src/shared/).
- Caller: [`client/src/lib/api/httpResearcherApi.ts`](../../packages/client/src/lib/api/httpResearcherApi.ts).

**From R or Python**: create a study, upload units ([createUnits](#createunits))
and a design version, deploy it (which makes the links), send coders a link,
then download the answers ([listAnnotations](#listannotations)) and the coders
([listCoders](#listcoders)). `server/src/__tests__/researcherApi.test.ts` does
exactly this.

**Authentication.** A researcher is a user (a login at the provider). Requests
carry one of:

- the **session cookie** from logging in (the researcher UI): same origin
  only, with the header `x-annotinder: 1` (CSRF). See `docs/coder-identity.md` §7.
- a personal **API key**: `authorization: Bearer <key>` (keys start with
  `atk_`). Made in the UI ([createApiKey](#createapikey)) or, without login,
  with the server's `keys` command (`packages/server/README.md`).
- development only (`AUTH_DEV_MODE=1`, as `pnpm dev` sets; localhost only):
  `x-dev-role` / `x-dev-email` (and `x-dev-account-role`, default `admin`).

**Roles.** A user has a role per study: `READ` < `WRITE` < `ADMIN` (the Role
column below is the minimum). A study's creator is its `ADMIN` and owner.
Each user also has an **account role** (`docs/accounts.md`): `user`,
`researcher` (creates studies), `admin` (also the [admin API](admin.md)).

**Second factor and sensitive actions.** Researchers work without a second
factor; server admin access needs one (else 403 `mfa_required`;
`security.md` §1). API keys count as having one. **Sensitive actions**
(creating or revoking API keys, resetting answers, deleting coders' data or a
study, exporting a study, changing a study's ADMINs or the admin role) need a
web session whose second factor is at most `AUTH_STEP_UP_MAX_AGE` seconds old
(403 `step_up_required`: log in again with `/auth/login?stepUp=1`), and never
work with an API key (403 `not_with_api_key`).

**Errors** are `{ error, code? }`:

| Status | Meaning |
|---|---|
| 400 | invalid body or parameter |
| 401 | not logged in, no valid API key |
| 403 | no (sufficient) role (`researcher_required` for the account role); `limit_reached` (the owner's limits); `study_suspended` (only reading and deleting still work) |
| 404 | not found |
| 409 | not allowed in this state (e.g. editing a deployed design version) |
| 413 | too large (`unit_too_large`) |
| 429 | `rate_limited` (`security.md` §3) |

| Endpoint | | Role | Request | Response |
|---|---|---|---|---|
| **Account** | | | | |
| [getAuthOptions](#getauthoptions) | `GET /auth/options` | none | – | `AuthOptionsSchema` |
| [logout](#logout) | `POST /auth/logout` | none | – | – |
| [getMe](#getme) | `GET /me` | any | – | `MeResponseSchema` |
| [requestResearcher](#requestresearcher) | `POST /me/researcher-request` | any | `ResearcherRequestWriteSchema` | `MeResponseSchema` |
| [listApiKeys](#listapikeys) | `GET /me/keys` | any | – | `ApiKeyResponseSchema[]` |
| [createApiKey](#createapikey) | `POST /me/keys` | any | `ApiKeyWriteSchema` | `ApiKeyCreatedSchema` |
| [revokeApiKey](#revokeapikey) | `POST /me/keys/:id/revoke` | any | – | `ApiKeyResponseSchema` |
| **Studies** | | | | |
| [listStudies](#liststudies) | `GET /study` | any | – | `StudyResponseSchema[]` |
| [createStudy](#createstudy) | `POST /study` | any | `StudyWriteSchema` | `StudyResponseSchema` |
| [listExamples](#listexamples) | `GET /examples` | any | – | `ExampleSummarySchema[]` |
| [createStudyFromExample](#createstudyfromexample) | `POST /study/from-example` | any | `StudyFromExampleSchema` | `StudyResponseSchema` |
| [createStudyFromRecipe](#createstudyfromrecipe) | `POST /study/from-recipe` | any | `RecipeSchema` | `StudyResponseSchema` |
| [exportStudy](#exportstudy) | `GET /study/:id/export` | ADMIN | – | gzip file |
| [importStudy](#importstudy) | `POST /study/import` | any | the export's bytes | `StudyResponseSchema` |
| [getStudy](#getstudy) | `GET /study/:id` | READ | – | `StudyResponseSchema` |
| [updateStudy](#updatestudy) | `PUT /study/:id` | ADMIN | `StudyWriteSchema` | `StudyResponseSchema` |
| [deleteStudy](#deletestudy) | `DELETE /study/:id` | ADMIN | – | – |
| [getStudyUsers](#getstudyusers) | `GET /study/:id/users` | ADMIN | – | `StudyUserResponseSchema[]` |
| [putStudyUsers](#putstudyusers) | `PUT /study/:id/users` | ADMIN | `StudyUsersWriteSchema` | – |
| [getOverview](#getoverview) | `GET /study/:studyId/overview` | READ | – | `StudyOverviewSchema` |
| **Designs** | | | | |
| [listDesignVersions](#listdesignversions) | `GET /study/:studyId/design` | READ | – | `DesignVersionMetaSchema[]` |
| [getDesignVersion](#getdesignversion) | `GET /study/:studyId/design/:id` | READ | – | `DesignVersionSchema` |
| [createDesignVersion](#createdesignversion) | `POST /study/:studyId/design` | WRITE | `DesignWriteSchema` | `DesignVersionSchema` |
| [updateDesignVersion](#updatedesignversion) | `PUT /study/:studyId/design/:id` | WRITE | `DesignWriteSchema` | `DesignVersionSchema` |
| [deleteDesignVersion](#deletedesignversion) | `DELETE /study/:studyId/design/:id` | WRITE | – | – |
| **Units and sets** | | | | |
| [listUnits](#listunits) | `GET /study/:studyId/units` | READ | – | `UnitMetaSchema[]` |
| [getUnitFields](#getunitfields) | `GET /study/:studyId/units/fields` | READ | – | `UnitFieldSchema[]` |
| [putUnitFields](#putunitfields) | `PUT /study/:studyId/units/fields` | WRITE | `UnitsSpecSchema` | `UnitFieldSchema[]` |
| [listUnitPage](#listunitpage) | `GET /study/:studyId/units/page` | READ | – | `UnitPageSchema` |
| [getUnit](#getunit) | `GET /study/:studyId/units/:id` | READ | – | `UnitResponseSchema` |
| [createUnits](#createunits) | `POST /study/:studyId/units` | WRITE | `UnitsCreateBodySchema` | `UnitResponseSchema[]` |
| [deleteUnit](#deleteunit) | `DELETE /study/:studyId/units/:id` | WRITE | – | – |
| [listSetGroups](#listsetgroups) | `GET /study/:studyId/sets` | READ | – | `SetGroupResponseSchema[]` |
| [putSetGroup](#putsetgroup) | `PUT /study/:studyId/sets/:group` | WRITE | `SetGroupWriteSchema` | `SetGroupResponseSchema` |
| [deleteSetGroup](#deletesetgroup) | `DELETE /study/:studyId/sets/:group` | WRITE | – | – |
| **Links and coders** | | | | |
| [listLinks](#listlinks) | `GET /study/:studyId/links` | WRITE | – | `LinkResponseSchema[]` |
| [revokeLink](#revokelink) | `POST /study/:studyId/links/:id/revoke` | WRITE | – | `LinkResponseSchema` |
| [reopenLink](#reopenlink) | `POST /study/:studyId/links/:id/reopen` | WRITE | – | `LinkResponseSchema` |
| [renewLinkSecret](#renewlinksecret) | `POST /study/:studyId/links/:id/secret` | WRITE | – | `LinkResponseSchema` |
| [listCoders](#listcoders) | `GET /study/:studyId/coders` | READ | – | `CoderProgressSchema[]` |
| [deleteCoders](#deletecoders) | `POST /study/:studyId/coders/delete` | ADMIN | `DeleteCodersSchema` | `DeleteCodersResponseSchema` |
| [postponeDeletion](#postponedeletion) | `POST /study/:studyId/coders/:id/deletion-request/postpone` | ADMIN | – | – |
| [listCoderDeletions](#listcoderdeletions) | `GET /study/:studyId/coders/deletions` | READ | – | `CoderDeletionSchema[]` |
| **Deploying** | | | | |
| [getDeployment](#getdeployment) | `GET /study/:studyId/deployment` | READ | – | `DeploymentResponseSchema \| null` |
| [putDeployment](#putdeployment) | `PUT /study/:studyId/deployment` | ADMIN | `DeploymentWriteSchema` | `DeploymentResponseSchema` |
| [getPendingChanges](#getpendingchanges) | `GET /study/:studyId/deployment/pending` | READ | – | `PendingChangesSchema` |
| [listDeploymentVersions](#listdeploymentversions) | `GET /study/:studyId/deployment/versions` | READ | – | `DeploymentVersionSchema[]` |
| [getDeploymentStatus](#getdeploymentstatus) | `GET /study/:studyId/deployment/status` | READ | – | `DeploymentStatusSchema` |
| [createPreview](#createpreview) | `POST /study/:studyId/deployment/preview` | WRITE | – | `PreviewSessionSchema` |
| [resetAnnotations](#resetannotations) | `POST /study/:studyId/annotations/reset` | ADMIN | `ResetAnnotationsSchema` | `{ retired }` |
| **Annotations** | | | | |
| [listAnnotations](#listannotations) | `GET /study/:studyId/annotations` | READ | query `AnnotationsQuerySchema` | `AnnotationPageSchema` |
| [listUnitVersions](#listunitversions) | `GET /study/:studyId/unit-versions` | READ | query `UnitVersionsQuerySchema` | `UnitVersionPageSchema` |
| [listDevices](#listdevices) | `GET /study/:studyId/devices` | READ | – | `DeviceSchema[]` |
| [getResultsAnswers](#getresultsanswers) | `GET /study/:studyId/results/answers` | READ | – | `ResultsAnswersSchema` |
| [getResultsAgreement](#getresultsagreement) | `GET /study/:studyId/results/agreement` | READ | – | `ResultsAgreementSchema` |
| [listResultUnits](#listresultunits) | `GET /study/:studyId/results/units` | READ | – | `ResultsUnitsSchema` |
| [getResultUnit](#getresultunit) | `GET /study/:studyId/results/units/:unitId` | READ | – | `ResultsUnitSchema` |
| [listResultCoders](#listresultcoders) | `GET /study/:studyId/results/coders` | READ | – | `ResultsCodersSchema` |
| [exportResults](#exportresults) | `POST /study/:studyId/results/export` | READ | – | `ResultsExportSchema` |

## Account

Schemas: [`contracts/src/account.ts`](../../packages/contracts/src/account.ts).
Implementation: [`researcher/me.ts`](../../packages/server/src/researcher/me.ts),
[`shared/accounts.ts`](../../packages/server/src/shared/accounts.ts).

### getAuthOptions

`GET /auth/options` → `AuthOptionsSchema`, without authentication: whether
this server has login (`login`), accepts development headers (`devMode`),
and, while it moves to another login provider, until when the previous one
is accepted (`previous: { until }`, else null).

### logout

`POST /auth/logout` (with `x-annotinder: 1`) → 204: ends the login session
and clears its cookie.

Logging in itself is not a JSON endpoint: the browser opens
`GET /auth/login?returnTo=<path on this origin>`, which redirects to the
provider; the provider redirects back to `/api/auth/callback`, which starts the
session and redirects to `returnTo`. A refused login comes back with
`?loginError=email_unverified|blocked|login_failed|step_up_failed|link_failed`
(`LoginErrorSchema`). Options: `stepUp=1` (a fresh second factor for
sensitive actions, `docs/security.md` §1); `provider=previous` (the
previous login provider, until `previous.until`); `link=1` (with a session:
adds the login at the current provider to this account, account linking;
`link_failed` if that login is someone else's). The login is the user of
that identity (`iss` + `sub`), or claims an invitation for its verified
email (`docs/accounts.md` §1).

### getMe

`GET /me` → `MeResponseSchema`: the email the request is authenticated as,
their account `role`, their `limits` and `usage` (studies they own and their
units), an open `researcherRequest`, whether the server takes requests
(`canRequestResearcher`), and `twoFactor`: `enabled` (the server asks for a
second factor), `used` (this login had one), `setupUrl` (the provider's
account page, `OIDC_ACCOUNT_URL`), `adminOff` (a server admin whose login
had none: admin access is off) and `freshUntil` (until when sensitive
actions work without logging in again; null: they need a step-up login
now).

### requestResearcher

`POST /me/researcher-request` (`{ message }`) → `MeResponseSchema`: asks
the server's admins to become a researcher. 403 if the server takes no
requests, 409 for researchers.

### listApiKeys

`GET /me/keys` → `ApiKeyResponseSchema[]`: your keys, revoked ones
included, with their prefix and when they were last used. Never the keys
themselves: the server stores only a hash.

### createApiKey

`POST /me/keys` → `ApiKeyCreatedSchema` (201): a new key, `key` shown only
in this response. Sensitive: a web session with a recent second factor
(403 `step_up_required`), never an API key (403 `not_with_api_key`). Keys
never do sensitive actions.

### revokeApiKey

`POST /me/keys/:id/revoke` → `ApiKeyResponseSchema`. The key stops working
at once. 404 if it isn't one of your keys. Sensitive, as `createApiKey`.

## Studies

Schemas: [`contracts/src/study.ts`](../../packages/contracts/src/study.ts), [`overview.ts`](../../packages/contracts/src/overview.ts).
Implementation: [`researcher/study.ts`](../../packages/server/src/researcher/study.ts), [`study.$id.ts`](../../packages/server/src/researcher/study.$id.ts), [`study.$id.users.ts`](../../packages/server/src/researcher/study.$id.users.ts), overview in [`overview.ts`](../../packages/server/src/researcher/overview.ts) / [`shared/progress.ts`](../../packages/server/src/shared/progress.ts).

### listStudies

`GET /study` → `StudyResponseSchema[]`. The studies the user has a role in (with
development headers: all studies).

### createStudy

`POST /study` → `StudyResponseSchema` (201). Needs the account role
`researcher` (403 `researcher_required`), within their `studies` limit (403
`limit_reached`). The creator owns it and becomes its `ADMIN`. (With
development headers the study has no study users, so any development role
gets in.)

### listExamples

`GET /examples` → `ExampleSummarySchema[]`: the example studies this server
ships (`packages/server/examples/<id>.json`): id, category, title, what it
shows and what to try (`docs/examples.md`).

### createStudyFromExample

`POST /study/from-example` (`{ example, name? }`) → `StudyResponseSchema`
(201): a new study from an example, like `createStudy` (the same role, limits
and ownership): its units and sets, its design deployed (which makes
its links), and its example answers (coders named "Example coder n").
The study's `origin` is the example's id. 404 for an unknown example.

### createStudyFromRecipe

`POST /study/from-recipe` → `StudyResponseSchema` (201): a new study from a
recipe (`contracts/src/recipe.ts`), as the setup wizard writes one, like
`createStudy` (the same role, limits and ownership), in one transaction:

- `units` (`{ id, data }`; the first unit's fields become the study's) and
  `sets`: role columns by the units' ids (`[{ group, sets: [{ name, units,
  ordered? }] }]`, `group` one of `coder_set`, `condition_set`, `part_set`,
  `test_unit`);
- `design` (`{ note?, public?, session?, units?, items }`): the first version, saved as a draft that
  may have issues (e.g. questions without an answer type yet). With
  `publish: true` it is deployed, and must then pass validation. `units`:
  the unit fields, declared (types, descriptions, in their order), as a
  design file has them; the units' values must fit them, and
  fields only the units have are added after them.

A recipe has no links: deploying its design makes them. 400
`recipe_invalid` for a unit id used twice, a set naming an unknown unit, a
column defined twice, or a design to deploy that has issues or fails the
deploy's errors ([putDeployment](#putdeployment)); nothing is created then. Example studies are recipes too
(`packages/server/examples/`), with example answers.

### getStudy

`GET /study/:id` → `StudyResponseSchema`.

### updateStudy

`PUT /study/:id` → `StudyResponseSchema`. Rename, set `archived` (hidden from
active lists), `keepSessionsOpen`: finished coder sessions stay open
(off by default: `docs/coder-identity.md` §9), or `redirectUrls`: the
deployment settings end items' `redirectSetting` names, e.g. a panel's
return links (`docs/architecture.md` §5); coders get them at once, without
a deploy. `StudyResponseSchema` also has
`suspendedAt` (a server admin suspended the study).

### deleteStudy

`DELETE /study/:id` → 204. Removes the study and everything in it.

### exportStudy

`GET /study/:id/export` → the study export (`application/gzip`, a file
`<study>_<date>.annotinder.gz`): the whole study, coders and answers
included, as gzipped JSON lines (a manifest, `StudyExportManifestSchema`,
then the rows). Study ADMIN, and sensitive: a web session with a recent
second factor (403 `step_up_required`), never an API key (403
`not_with_api_key`). Logged in `security_log` (`study_exported`). See
`docs/hosting.md` "Moving a study".

### importStudy

`POST /study/import` with the export's bytes as the body → `StudyResponseSchema`
(201): a new study from it, owned by the importer (a researcher, within
their limits). Query: `name` (else the exported one), `coders=false`
(without coders, their devices and answers; links' uses start at 0). The
export's rows are migrated to this release first; every id is new and
links get new secrets. 400 `export_invalid` for a file that isn't an
export, comes from a newer release or from a database this release doesn't
know.

### getStudyUsers

`GET /study/:id/users` → `StudyUserResponseSchema[]`: email and role per
user; `pending`: invited, not logged in yet; `disabled`: the safeguards
turned the role off (an invitation older than 3 months, or a user back
after a year without a second factor; `docs/accounts.md` §2).

### putStudyUsers

`PUT /study/:id/users` → 204. Replaces the whole list; it must keep at least one `ADMIN` (400 otherwise). Emails are stored lowercased, as accounts are; an email twice in the list is a 400. The role goes to the user who has the address now, or to an invitation (a shadow user) that their first login claims. `restore: true` on an entry turns a `disabled` role on again. A change in who is `ADMIN` is sensitive: a web session with a recent second factor (403 `step_up_required`), never an API key (403 `not_with_api_key`).

### getOverview

`GET /study/:studyId/overview` → `StudyOverviewSchema`. Counts for the overview
page: units, role columns with their values' sizes (`groups: [{ name, sets:
[{ name, units }] }]`), coders (total, started, active in the last
24 hours), live answers, finished codings for the live design's loops, and
answers per day for the last 30 days. "Finished": every question of the
loop has a live answer.

## Designs

Versions of the study's design, in order of creation. One is **live** (the
deployment's); the latest, if unpublished, is the **draft**
([`docs/client.md`](../client.md) §7).
Schemas: [`contracts/src/design/designVersion.ts`](../../packages/contracts/src/design/designVersion.ts).
Implementation: [`researcher/design.ts`](../../packages/server/src/researcher/design.ts), [`design.$id.ts`](../../packages/server/src/researcher/design.$id.ts).

### listDesignVersions

`GET /study/:studyId/design` → `DesignVersionMetaSchema[]` (id, note, created,
immutable), oldest first: the position is the version number.

### getDesignVersion

`GET /study/:studyId/design/:id` → `DesignVersionSchema`: the whole document.

### createDesignVersion

`POST /study/:studyId/design` → `DesignVersionSchema` (201). A new version.
The body is always the full document, with an optional `note` (what
changed). A draft may be saved while it doesn't pass validation (work in
progress): `items` only has to be a list (`DraftItemsSchema`). The response says whether it is `valid`
(`DesignItemsSchema`: nesting rules, unique names, references), which
deploying and previewing require. Versions also have `updated`,
`updatedBy` (the email of who saved last) and `revision`.

A design version is `{ public, session, units, items }`: `public` what
coders see about the study (`{ title }`, or null), `session` how a coder's
session starts (the coder unit assignment `invite`, URL parameters `urlParams`,
the normal end `end`; `{}` without), `units.fields` the declared unit
fields, `items` the top-level questions, experiments, blocks and unit loops
(blocks and loops holding questions, end items and nested blocks; blocks
also experiments). On `PUT`,
a left-out `session`, `public` or `units` is kept; `public: null` removes it.

### updateDesignVersion

`PUT /study/:studyId/design/:id` → `DesignVersionSchema`. Full replace of
items and note; bumps `revision`. 409 once `immutable` (deployed). With
`revision` (the revision the edits are based on): 409
`DesignConflictSchema` (`code: "design_conflict"`, who saved when) if
someone saved since, instead of overwriting their work. Without it, the
save overwrites.

### deleteDesignVersion

`DELETE /study/:studyId/design/:id` → 204. Deletes a draft (for everyone; the
editor offers this only in the versions dialog). 409 once `immutable`.

## Units and sets

Schemas: [`contracts/src/unit.ts`](../../packages/contracts/src/unit.ts), [`unitFields.ts`](../../packages/contracts/src/unitFields.ts), [`sets.ts`](../../packages/contracts/src/sets.ts).
Implementation: [`researcher/units*.ts`](../../packages/server/src/researcher/), [`sets.ts`](../../packages/server/src/researcher/sets.ts).

**Unit fields.** All units of a study have the same fields, each `text`,
`number` or `boolean`; values are stored typed (`42`, not `"42"`), and `null`
is an empty value of any type. The first upload sets the fields
(`fieldsOfUnits` in `unitFields.ts`). A later upload must give every
existing field a fitting value (`checkUnitData`; `null` for empty) and may
add fields (`addedFields`): they are appended, and units already stored
have no value for them. New field names are letters, digits and `_`, not
starting with a digit (`UNIT_FIELD_NAME`), so designs can refer to them
as `$unit.<name>`. Deleting all units resets the fields. Clients infer the
types of CSV columns (`inferFieldType`) and send typed values. The role
columns (`coder_set`, `condition_set`, `part_set`, `test_unit`) aren't
unit data: the client's CSV upload writes them with
[putSetGroup](#putsetgroup).

### listUnits

`GET /study/:studyId/units` → `UnitMetaSchema[]`: id, external id and content
hash of every unit, without data.

### getUnitFields

`GET /study/:studyId/units/fields` → `UnitFieldSchema[]`: the study's fields, in
column order: the latest design version's `units.fields`, the design's
one specification of them (`docs/architecture.md` §8.4). Match this static
path (and `/units/page`) before `/units/:id`.

Uploads keep it up to date: new columns are added to the draft design (a
new draft if the latest version is deployed); the first upload (no units
yet) takes its types from the values. A design write without `units`
keeps the fields; deploying a design version that uses an undeclared field is 400
`undeclared_fields`.

### putUnitFields

`PUT /study/:studyId/units/fields` (`{ fields }`) → `UnitFieldSchema[]`: replaces
the draft design's fields. Declare a field the design uses, retype one
(400 if a unit's value doesn't fit), describe one, or remove one the
design doesn't use (409 if it does): its values leave the draft units
(deployed units keep them until the next deploy).

### listUnitPage

`GET /study/:studyId/units/page?offset=0&limit=50&group=&set=` → `UnitPageSchema`:
a page of units with their data (`limit` at most 200) and the `total`. All
units by id, or with `group` and `set` that set's units in the set's order
(404 for an unknown set).

### getUnit

`GET /study/:studyId/units/:id` → `UnitResponseSchema`, with `data`.

### createUnits

`POST /study/:studyId/units` → `UnitResponseSchema[]` (201). Up to 200 per
call, all or nothing. Every unit's data must fit the study's fields (400 with
the first problem, e.g. `Unit 'u3': Field 'n' is number, got text`); the
first upload sets them, later ones may add fields. An existing external id is a 409, unless
`overwrite: true`; a unit that was coded (`coded`) also needs
`overwriteCoded: true`. Its answers keep the unit version their coder saw
([listUnitVersions](#listunitversions)); spans may no longer fit the new
text. Units go into the draft: coders get them, or a changed unit's new
version (a new content hash), once they are deployed
([putDeployment](#putdeployment)).

### deleteUnit

`DELETE /study/:studyId/units/:id` → 204. Takes the unit out of the draft
(coders keep it until the next deploy). A unit that was deployed or coded
is kept for those, and comes back when uploaded again. Deleting the last
unit resets the fields.

**Role columns.** Four unit columns have a fixed name and meaning
(`docs/architecture.md` §6, `docs/plans/unit-sets.md`): `coder_set` (who
codes a unit, specific coders), `condition_set` (the conditions of the
experiment that selects units), `part_set` (a loop shows one part) and
`test_unit` (`overlap`, `practice` or `gold`). Their values are named sets
of units (tables `unit_sets`, `unit_set_members`). The endpoints call a
column a *group* and its values *sets*. Values are at most 128 characters,
without `;` or `#`. A unit can have several values of a `*_set` column, and
one `test_unit` type at most. Sets are not part of the unit's data
(changing them is no new unit version). They are drafts: coders and links get them when they are
deployed with `units: true`.

### listSetGroups

`GET /study/:studyId/sets` → `SetGroupResponseSchema[]`: per role column its values,
each with its unit ids in order and `ordered` (positions were given). The
draft's sets; `?live=true`: the deployed ones (what coders and links get).

### putSetGroup

`PUT /study/:studyId/sets/:group` (`{ sets: [{ name, unitIds, ordered? }] }`)
→ `SetGroupResponseSchema`. Makes or replaces the whole column, and
declares it in the draft as a unit field (type `set`; `test_unit`:
`unit_type`; 409 if a field of another type has the name). `group` must be
a role column (400 otherwise); `test_unit` takes only `overlap`,
`practice` and `gold`, one per unit (400). The unit ids in order: the order coders get
them in, for loops in set order. Only the study's own units (400
otherwise).

### deleteSetGroup

`DELETE /study/:studyId/sets/:group` → 204. 409 while the deployed or latest
design uses the column (`coder_set` with specific coders, `condition_set`
with an experiment that selects units, `part_set` with a loop's part).

Filling a column is done by the client (`distributeUnits` for `coder_set`
with its test units, `splitIntoSets` for `condition_set` and `part_set`, in
contracts `sets.ts`), which then writes it with
[putSetGroup](#putsetgroup): the server only stores sets.

## Links and coders

Schemas: [`contracts/src/coder.ts`](../../packages/contracts/src/coder.ts).
Implementation: [`researcher/links.ts`](../../packages/server/src/researcher/links.ts), [`shared/links.ts`](../../packages/server/src/shared/links.ts), [`coders.ts`](../../packages/server/src/researcher/coders.ts), [`shared/progress.ts`](../../packages/server/src/shared/progress.ts).
See [`docs/coder-identity.md`](../coder-identity.md) for what links do.

Links are not created by hand: deploying makes one, or for specific coders
with a link each (`invite: { mode: "coders", link: "per_coder" }`) one per
coder of `coder_set` (`params: { coder }`), and deploying `coder_set`
changes syncs them ([putDeployment](#putdeployment)): links follow the
deployed sets. A link no
longer made is **retired** (`retiredAt`), never deleted: new coders get 403
`link_inactive`, coders who started keep working. It comes back, with the
same secret, if it is made again (e.g. the coder is back in `coder_set`).
A link has no settings of its own: its label is its values (or "Open
link"), and its `maxUses` (read-only) is the deployed design's One link limit
(`maxCoders`).

### listLinks

`GET /study/:studyId/links` → `LinkResponseSchema[]`, active links
first, with `label`, `params` (`{ coder }` for a coder's link, else `{}`), `uses`, `maxUses`, `created`, `revokedAt` and
`retiredAt`.

### revokeLink

`POST /study/:studyId/links/:id/revoke` → `LinkResponseSchema`. No new
coders from this link; coders who already started keep working. A redeploy
keeps it revoked.

### reopenLink

`POST /study/:studyId/links/:id/reopen` → `LinkResponseSchema`. Undoes a
revoke: new coders can join with the link again.

### renewLinkSecret

`POST /study/:studyId/links/:id/secret` → `LinkResponseSchema`. A new
secret: the old address stops working (e.g. it was shared too widely);
coders who already started keep working.

### listCoders

`GET /study/:studyId/coders` → `CoderProgressSchema[]`: per coder session
(`id`) the link, the coder id (`coder`), started, last active, live answers, finished units per
loop of the live design version, `special`: the deployed test units
(`test_unit`: `overlap`, `gold`, `practice`) they finished, of how many (for
the kinds the study has), `variables`: their coder-level values
(answers outside unit loops, and experiments' conditions), `session`: their
`$session` values (URL parameters, `source`, the coder), `email` only where
the coder unit assignment requires sign-in, `ended`: how the
session ended (at an `end` item: item, outcome `screenout` or `complete`;
or outcome `quit`; and the time), or null, and `deletionRequest`: the
coder's request to delete their answers (`at`, `postponedAt` once the
researcher chose to delete later), or null.

### listCoderUnits

`GET /study/:studyId/coders/units` → `CoderUnitsSchema` (`{ coders: [{
coder, unitIds }] }`): per coder id, the units their sessions were shown
or answered (retired answers left out). The researcher UI keeps these
with their coders when it makes the coder set (`coder_set`) again (contracts
`distributeUnits`).

### deleteCoders

`POST /study/:studyId/coders/delete` (`DeleteCodersSchema`: `{ sessionIds?,
coders?, emails? }`, at least one) → `{ sessionIds, answers }`. ADMIN.
Deletes the matching coder sessions of the study and all their answers, also reset
ones, for good (a coder withdrew; docs/coder-identity.md §8). Units
nobody has answers for any more can be deleted again; unit versions stay.
Each deleted coder is logged (listCoderDeletions); `deletedBy` is the
researcher's email.

### postponeDeletion

`POST /study/:studyId/coders/:id/deletion-request/postpone` → 204 (404 without a
request). ADMIN. Delete later: sets `postponedAt` on the request, which the
UI then no longer brings up. The request stays until the coder is deleted.

### listCoderDeletions

`GET /study/:studyId/coders/deletions` → `CoderDeletionSchema[]`, newest first:
per deleted coder session `sessionId`, `coder`, `requestedAt` (if
they asked), `deletedAt`, `deletedBy` and `answers` (rows deleted). Kept
after the data is gone, with the ids downloaded results use, so the coder
can be deleted from those too. Not the email address: nothing that
identifies the person is kept.

## Deploying

These change or read what coders get; status and preview go to the study's
runtime (`server.deployments`). Schemas:
[`contracts/src/deployment.ts`](../../packages/contracts/src/deployment.ts).
Implementation: [`researcher/deployment*.ts`](../../packages/server/src/researcher/), [`shared/deployments.ts`](../../packages/server/src/shared/deployments.ts), [`runtime/registry.ts`](../../packages/server/src/runtime/registry.ts).

### getDeployment

`GET /study/:studyId/deployment` → `DeploymentResponseSchema | null`: the live
design version id, `active`, `version`; null if never deployed.

### putDeployment

`PUT /study/:studyId/deployment` → `DeploymentResponseSchema`. Deploy a
design version, with the draft units and sets if `units: true`
(default false: the deployed ones stay, so a new design version or a pause deploys
no units by accident; the first deploy always takes the draft's),
or pause/resume with `active`. Units and sets are drafts until deployed
(`docs/architecture.md` §8.4):

1. check that the design version passes validation (400 with `issues` if not:
   drafts may be saved with issues, coders only get valid designs), and
   check it against the role columns (400 `assignment_invalid` with the
   errors: specific coders without `coder_set` values, coders who sign in
   whose values aren't all email addresses, an experiment that selects
   units without `condition_set` or with listed conditions it has no units
   for; `shared/sets.ts` `assignmentChecks`);
2. with `units`: new versions of the units the draft changed (versions
   they replace that no answer points to are deleted), and the draft's
   sets become the deployed ones;
3. store it, bump `version` if the design version or the units changed (pausing
   and resuming don't: coders don't reload), record the version with what
   it changed ([listDeploymentVersions](#listdeploymentversions)), and make
   the design version immutable;
4. sync the study's links (contracts `linkCombinations`): one, one per
   coder with a link each; links no longer made (a coder that is gone) are
   retired. Above 500 links this
   needs `confirmLinks: true` (409 `confirm_links` otherwise), and more
   than 2000 is 400 `too_many_links`. The response's `links` is the number
   of active links;
5. bump the deployment's revision, so every server process re-reads it on
   its next request.

Paused (`active: false`): coders save what they have open, but get no new
units and no new sessions (409 `study_paused`; the coding screen says the
study is paused) until it is resumed.

Return `warnings` the researcher should see, e.g. a loop that gained
questions, which makes units coders finished unfinished again, conditions
of `condition_set` the experiment doesn't list, a loop's part `part_set`
doesn't have, a part no loop shows, units no coder gets, practice or gold
units a loop checks but doesn't have (or without right answers in
`answer_<q>`), or an
end item's redirect setting without a URL.

### getPendingChanges

`GET /study/:studyId/deployment/pending` → `PendingChangesSchema`: what
deploying the drafts would change: `units` (`added`, `changed`, `removed`,
and whether the `sets` differ; all added before the first deploy) and
`designVersionId`, the latest design version if it isn't the deployed one.

### listDeploymentVersions

`GET /study/:studyId/deployment/versions` → `DeploymentVersionSchema[]`,
newest first: each deployed version with its design version and what it changed
(`changes.design`, `changes.units`: null when the units stayed), and the
client it ran on (`client: { release, commit }`; null for deployments
before this was recorded). A design version as a file (`design.json`,
contracts `DesignFileSchema`) is built from `getDesignVersion` and this.

### getDeploymentStatus

`GET /study/:studyId/deployment/status` → `DeploymentStatusSchema`: per loop
and set (`set`: `<role column>/<value>`, or `__all__` for all units) the units complete, started and leased, codings and coders,
computed on demand. 404 if not
deployed.

### createPreview

`POST /study/:studyId/deployment/preview` → `PreviewSessionSchema`. A preview of
the latest design version (deployed or not), as deployment `<studyId>.preview`:
the real units, but coders and answers kept in memory only. The token (an
HMAC with the server's secret, valid 12 hours) is used like a link
secret. A latest design version with validation issues can't be previewed: the
preview's coder API answers 409 `design_invalid`.

### resetAnnotations

`POST /study/:studyId/annotations/reset` → `{ retired }`. Retires the live values
of these variables (optionally only some units, `unitIds`, or coder sessions, `sessionIds`): kept for
analysis, but they no longer count, so the units are coded again. Bumps
the deployment's `annotationEpoch`: runtimes re-read it and derive the
finished codings again. Only answers to units are reset.

## Annotations

Schemas: [`contracts/src/annotations.ts`](../../packages/contracts/src/annotations.ts).
Implementation: [`researcher/annotations.ts`](../../packages/server/src/researcher/annotations.ts).

### listAnnotations

`GET /study/:studyId/annotations?after=&limit=&retired=` → `AnnotationPageSchema`:
one row per answer: unit, coder session (`sessionId`) and variable (`value` is a
`VariableValue`), with the unit's `externalId`, the coder id
(`coder`), the design version it was answered under, the unit
version the coder saw (`unitVersionId`), the device (`deviceId`), how
long the coder took as their browser measured it (`timing`), for unit
answers when the server first handed the unit to the coder (`servedAt`),
and `created` / `updated`. Answers outside unit loops (survey questions) are
rows too, with `unitId` null; so are values the server assigned (random
or balanced groups), marked `assigned`.

- **Paging**: rows come in the order they were first written (by `id`).
  `limit` rows per page (default 1000, at most 10000); pass `next` as
  `after` for the next page, until `next` is null. New answers come after
  the rows already read, so a script can keep `next` and fetch what is new
  later. A coder who changes an answer updates its row in place (same `id`,
  a later `updated`): to catch edits, read everything again.
- **Live values only**, unless `retired=true`: then also values that were
  reset (by a researcher), with `retiredAt`. A coder's earlier answer that
  they changed themselves is not kept.
- Coder-level values (rows without a unit) also come with the coders
  ([listCoders](#listcoders), `variables`). Resetting answers
  ([resetAnnotations](#resetannotations)) applies to unit answers only.

### listUnitVersions

`GET /study/:studyId/unit-versions?after=&limit=` → `UnitVersionPageSchema`:
units as coders saw them (`architecture.md` §8.4), one row per version:
the unit's id and `externalId`, a `hash`, the `data` shown (only the
fields the design used), and when it was first shown. Paged like
annotations. Join answers on `unitVersionId`.

### listDevices

`GET /study/:studyId/devices` → `DeviceSchema[]`: the devices coders used
(`coder-identity.md` §4), each with its coder, coarse `type` (phone,
tablet, desktop), `browser`, `os`, and when it joined the session. Answers
carry the device they were given on (`deviceId` in `listAnnotations`).

### getResultsAnswers

`GET /study/:studyId/results/answers` → `ResultsAnswersSchema`: per question
of the deployed design (a scale: per item), the answers given and skipped,
and per value how often it was given (several answers count each; span and
relation questions per label). Live answers only. Schemas:
[`contracts/src/results.ts`](../../packages/contracts/src/results.ts);
implementation: [`researcher/results.ts`](../../packages/server/src/researcher/results.ts).

### getResultsAgreement

`GET /study/:studyId/results/agreement` → `ResultsAgreementSchema`: per
unit-loop question, over units two or more coders answered: Krippendorff's
alpha (nominal, ordinal or interval, from the answer type), percent
agreement (the share of pairs of coders of a unit who agree), per coder
their agreement with the others and their Cohen's kappa (averaged over the
coders they share units with, weighed by the units shared), and `pairs`:
every pair of coders with units in common, with Cohen's kappa and percent
agreement. A question with
several answers has a row per option (given or not); a span question a row
per label, over the words of each text (labelled or not). Special options
("don't know") are left out of ordinal and interval alpha. Measures:
[`contracts/src/agreement.ts`](../../packages/contracts/src/agreement.ts).

### listResultUnits

`GET /study/:studyId/results/units` → `ResultsUnitsSchema`: per loop, the
units two or more coders answered, with `disagreement`: per question the
share of pairs of coders whose answers aren't identical, averaged over the
loop's questions. Most disagreement first.

### getResultUnit

`GET /study/:studyId/results/units/:unitId` → `ResultsUnitSchema`: the unit
versions its coders saw (the `data` shown), and every live answer to it,
with the coder session and coder id.

### listResultCoders

`GET /study/:studyId/results/coders` → `ResultsCodersSchema`: per coder
session with unit answers: units answered, the median time per unit (the
browser's on-screen times of its questions added up), and the answers
practice questions needed on average until right.

### exportResults

`POST /study/:studyId/results/export` → `ResultsExportSchema`: `{ url,
expires, size }`, a link to the study's raw export, valid an hour. Follow
`url` (relative to the server; no API key needed: the link is the key) to
download it. The server writes the export when asked, or returns the same
file while the study is unchanged.

The export is a zip of JSON-lines files, one per table, rows in this API's
shapes: `answers.jsonl` (`AnnotationRow`, also reset answers with
`retiredAt`), `units.jsonl` (`UnitVersion`), `coders.jsonl`
(`CoderProgress`), `design_versions.jsonl` (`DesignVersion` plus its
`number`), `deployments.jsonl`, `sets.jsonl`, `devices.jsonl`,
`deletions.jsonl`, and `manifest.json` (`ResultsExportManifestSchema`) with
the rows per file. The manifest is written last: a zip without it, or with
other counts, is incomplete. All files come from one snapshot of the study.

```r
zip <- tempfile(fileext = ".zip")
download.file(paste0(server, link$url), zip, mode = "wb")
answers <- jsonlite::stream_in(unz(zip, "answers.jsonl"))
```

```python
import io, zipfile, pandas as pd, requests
z = zipfile.ZipFile(io.BytesIO(requests.get(server + link["url"]).content))
answers = pd.read_json(z.open("answers.jsonl"), lines=True)
```

