# Researcher API

Served by the **server** at `/api/study/...` (the paths below are relative to `/api`), called by the client's **researcher
UI** (`ResearcherApi`), and by scripts (R, Python) and other systems (AmCAT):
managing studies, design versions, units and sets, links, deploying and progress.

- Contracts: `researcherEndpoints` in
  [`contracts/src/endpoints/researcher.ts`](../../packages/contracts/src/endpoints/researcher.ts).
- Implementation: [`server/src/researcher/`](../../packages/server/src/researcher/), one file per
  path, with shared queries in [`shared/`](../../packages/server/src/shared/).
- Caller: [`client/src/lib/api/httpResearcherApi.ts`](../../packages/client/src/lib/api/httpResearcherApi.ts).

**Authentication.** A researcher is a user, identified by their verified
email address. Requests carry one of:

- the **session cookie** from logging in (the researcher UI): the browser
  goes to `GET /auth/login?returnTo=<path>`, logs in at the server's OpenID
  Connect provider and comes back with an httpOnly cookie. Same origin
  only, and every request needs the `x-annotinder: 1` header (CSRF). See
  `docs/coder-identity.md` §7.
- a personal **API key**: `authorization: Bearer <key>` (keys start with
  `atk_`), for scripts and other systems. Logged-in researchers make keys
  in the UI ([createApiKey](#createapikey)); without login, the server's
  `keys` command makes them (see the server's README).

Implementation: [`researcher/auth.ts`](../../packages/server/src/researcher/auth.ts),
[`researcher/login.ts`](../../packages/server/src/researcher/login.ts),
[`shared/accounts.ts`](../../packages/server/src/shared/accounts.ts),
[`shared/sessions.ts`](../../packages/server/src/shared/sessions.ts).

Development only: a server started with `ANNOTINDER_DEV_AUTH=1` (as `pnpm
dev` does) also accepts `x-dev-role` / `x-dev-email` (and
`x-dev-account-role`, default `admin`) headers instead of a key, which the
dev shell's researcher UI uses. Never on a reachable server.

**Roles.** A user has a role per study (study users): `READ` < `WRITE` <
`ADMIN`. The role column below is the minimum. Whoever creates a study is its
`ADMIN`, and its owner. Apart from that, each user has an **account role**
on the server (`docs/accounts.md`): `user` (codes; works on studies they have
a role in), `researcher` (also creates studies, within their limits), `admin`
(also the [admin API](admin.md)).

**Second factor.** A server with `ANNOTINDER_2FA` set (`annotinder`:
passkeys, `oidc`: the provider's) answers 403 `mfa_required` to a login
that didn't give the second factor, except `GET /me` (which says so in
`twoFactor`) and the passkey routes (`/auth/passkey/...`, `security.md`
§1). API keys count as having one (making one needs it). Too many requests:
429 `rate_limited` (`security.md` §3).

**Limits.** Adding units, and creating a study, can be refused with 403
`limit_reached` (the study owner's limits), and a unit larger than the server
allows with 413 `unit_too_large`. A study a server admin suspended refuses
changes with 403 `study_suspended` (reading, deleting coders' data and
deleting the study still work).

**Errors** are `{ error, code? }` with a 4xx/5xx status: 400 invalid body or
parameter, 401 no valid API key, 403 no (sufficient) role in the study (or
account role: `researcher_required`), 404 not found, 409 not allowed in
this state (e.g. editing a deployed design version), 413 too large.

**From R or Python**: everything a script needs is here: create a study,
upload units ([createUnits](#createunits)) and a design version, deploy it
(which makes its links), send coders a link, then download the annotations ([listAnnotations](#listannotations))
and the coders with their coder-level answers ([listCoders](#listcoders)).
`server/src/__tests__/researcherApi.test.ts` does exactly this, with every
response checked against its contract schema.

| Endpoint | | Role | Request | Response |
|---|---|---|---|---|
| **Account** | | | | |
| [getAuthOptions](#getauthoptions) | `GET /auth/options` | none | – | `AuthOptionsSchema` |
| [logout](#logout) | `POST /auth/logout` | none | – | – |
| [getMe](#getme) | `GET /me` | any | – | `MeResponseSchema` |
| [requestResearcher](#requestresearcher) | `POST /me/researcher-request` | any | `ResearcherRequestWriteSchema` | `MeResponseSchema` |
| [redeemResearcherInvite](#redeemresearcherinvite) | `POST /me/researcher-invite` | any | `RedeemResearcherInviteSchema` | `MeResponseSchema` |
| [listApiKeys](#listapikeys) | `GET /me/keys` | any | – | `ApiKeyResponseSchema[]` |
| [createApiKey](#createapikey) | `POST /me/keys` | any | `ApiKeyWriteSchema` | `ApiKeyCreatedSchema` |
| [revokeApiKey](#revokeapikey) | `POST /me/keys/:id/revoke` | any | – | `ApiKeyResponseSchema` |
| **Studies** | | | | |
| [listStudies](#liststudies) | `GET /study` | any | – | `StudyResponseSchema[]` |
| [createStudy](#createstudy) | `POST /study` | any | `StudyWriteSchema` | `StudyResponseSchema` |
| [listExamples](#listexamples) | `GET /examples` | any | – | `ExampleSummarySchema[]` |
| [createStudyFromExample](#createstudyfromexample) | `POST /study/from-example` | any | `StudyFromExampleSchema` | `StudyResponseSchema` |
| [createStudyFromRecipe](#createstudyfromrecipe) | `POST /study/from-recipe` | any | `RecipeSchema` | `StudyResponseSchema` |
| [getStudy](#getstudy) | `GET /study/:id` | READ | – | `StudyResponseSchema` |
| [updateStudy](#updatestudy) | `PUT /study/:id` | ADMIN | `StudyWriteSchema` | `StudyResponseSchema` |
| [deleteStudy](#deletestudy) | `DELETE /study/:id` | ADMIN | – | – |
| [getStudyUsers](#getstudyusers) | `GET /study/:id/users` | ADMIN | – | `StudyUserSchema[]` |
| [putStudyUsers](#putstudyusers) | `PUT /study/:id/users` | ADMIN | `StudyUsersWriteSchema` | – |
| [getOverview](#getoverview) | `GET /study/:studyId/overview` | READ | – | `StudyOverviewSchema` |
| **Codebooks** | | | | |
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
| [updateLink](#updatelink) | `PUT /study/:studyId/links/:id` | WRITE | `LinkWriteSchema` | `LinkResponseSchema` |
| [revokeLink](#revokelink) | `POST /study/:studyId/links/:id/revoke` | WRITE | – | `LinkResponseSchema` |
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

## Account

Schemas: [`contracts/src/account.ts`](../../packages/contracts/src/account.ts).
Implementation: [`researcher/me.ts`](../../packages/server/src/researcher/me.ts),
[`shared/accounts.ts`](../../packages/server/src/shared/accounts.ts).

### getAuthOptions

`GET /auth/options` → `AuthOptionsSchema`, without authentication: whether
this server has login (`login`) and accepts development headers
(`devAuth`).

### logout

`POST /auth/logout` (with `x-annotinder: 1`) → 204: ends the login session
and clears its cookie.

Logging in itself is not a JSON endpoint: the browser opens
`GET /auth/login?returnTo=<path on this origin>`, which redirects to the
provider; the provider redirects back to `/api/auth/callback`, which starts the
session and redirects to `returnTo`. A refused login comes back with
`?loginError=email_unverified|blocked|login_failed`
(`LoginErrorSchema`). Logging in also applies the server's registration
rules (`docs/accounts.md`): it can make a user a researcher or an admin.

### getMe

`GET /me` → `MeResponseSchema`: the email the request is authenticated as,
their account `role`, their `limits` and `usage` (studies they own and their
units), an open `researcherRequest`, whether the server takes requests
(`canRequestResearcher`), and `mfaRequired` (this login lacks a second
factor the server requires: nothing else works until they log in with one).

### requestResearcher

`POST /me/researcher-request` (`{ message }`) → `MeResponseSchema`: asks
the server's admins to become a researcher. 403 if the server takes no
requests, 409 for researchers.

### redeemResearcherInvite

`POST /me/researcher-invite` (`{ secret }`) → `MeResponseSchema`: a
researcher invite link (from an admin) makes the user a researcher, with
its plan if they have none of their own. Works once; 404 `invite_invalid`
for an unknown, used, revoked or expired link. The researcher UI does this
for `?researcherInvite=<secret>` after logging in.

### listApiKeys

`GET /me/keys` → `ApiKeyResponseSchema[]`: your keys, revoked ones
included, with their prefix and when they were last used. Never the keys
themselves: the server stores only a hash.

### createApiKey

`POST /me/keys` → `ApiKeyCreatedSchema` (201): a new key, `key` shown only
in this response.

### revokeApiKey

`POST /me/keys/:id/revoke` → `ApiKeyResponseSchema`. The key stops working
at once. 404 if it isn't one of your keys.

## Studies

Schemas: [`contracts/src/study.ts`](../../packages/contracts/src/study.ts), [`overview.ts`](../../packages/contracts/src/overview.ts).
Implementation: [`researcher/study.ts`](../../packages/server/src/researcher/study.ts), [`study.$id.ts`](../../packages/server/src/researcher/study.$id.ts), [`study.$id.users.ts`](../../packages/server/src/researcher/study.$id.users.ts), overview in [`overview.ts`](../../packages/server/src/researcher/overview.ts) / [`shared/progress.ts`](../../packages/server/src/shared/progress.ts).

### listStudies

`GET /study` → `StudyResponseSchema[]`. The studies the user has a role in (with
development headers: all studies).

### createStudy

`POST /study` → `StudyResponseSchema` (201). Needs the account role
`researcher` (403 `researcher_required`), within their `studies` limit (403
`limit_reached`). The creator owns it and becomes its `ADMIN`.
(With development headers the study has no study users, which lets any
development role in.)

### listExamples

`GET /examples` → `ExampleSummarySchema[]`: the example studies this server
ships (`packages/server/examples/<id>.json`): id, category, title, what it
shows and what to try (`docs/plans/examples.md`).

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
  `sets`: set groups by the units' ids (`[{ group, sets: [{ name, units,
  ordered? }] }]`);
- `design` (`{ note?, public?, session?, items }`): the first version, saved as a draft that
  may have issues (e.g. questions without an answer type yet). With
  `publish: true` it is deployed, and must then pass validation.

A recipe has no links: deploying its design makes them. 400
`recipe_invalid` for a unit id used twice, a set naming an unknown unit, a
group defined twice, or a design to deploy that has issues; nothing is created then. Example studies are recipes too
(`packages/server/examples/`), with example answers.

### getStudy

`GET /study/:id` → `StudyResponseSchema`.

### updateStudy

`PUT /study/:id` → `StudyResponseSchema`. Rename, set `archived` (hidden from
active lists), `keepSessionsOpen`: finished coder sessions stay open
(off by default: `docs/coder-identity.md` §9), or `redirectUrls`: the
deployment settings end items' `redirectSetting` names, e.g. a panel's
return links (`docs/plans/design.md` §4); coders get them at once, without
a deploy. `StudyResponseSchema` also has
`suspendedAt` (a server admin suspended the study).

### deleteStudy

`DELETE /study/:id` → 204. Removes the study and everything in it.

### getStudyUsers

`GET /study/:id/users` → `StudyUserSchema[]`: email and role per user.

### putStudyUsers

`PUT /study/:id/users` → 204. Replaces the whole list; it must keep at least one `ADMIN` (400 otherwise). Emails are stored lowercased, as accounts are; an email twice in the list is a 400.

### getOverview

`GET /study/:studyId/overview` → `StudyOverviewSchema`. Counts for the overview
page: units, set groups with their sets' sizes (`groups: [{ name, sets:
[{ name, units }] }]`), coders (total, started, active in the last
24 hours), live answers, finished codings for the live design's loops, and
answers per day for the last 30 days. "Finished": every question of the
loop has a live answer.
Index answers by (study, created) to keep the per-day count cheap.

## Codebooks

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
session starts (link and URL parameters, participant id, combinations,
sample size; `{ params: [] }` without), `units.fields` the declared unit
fields, `items` the questions, loops, conditions and end items. On `PUT`,
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
types of CSV columns (`inferFieldType`) and send typed values.

### listUnits

`GET /study/:studyId/units` → `UnitMetaSchema[]`: id, external id and content
hash of every unit, without data.

### getUnitFields

`GET /study/:studyId/units/fields` → `UnitFieldSchema[]`: the study's fields, in
column order: the latest design version's `units.fields`, the design's
one specification of them (`docs/plans/design.md` §3). Match this static
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

**Sets.** Units belong to named sets within set groups (table
`unit_sets (study_id, grp, set_name, unit_id, position)`;
`docs/plans/sets-and-session-parameters.md` §1). A group's name is like a
field name; set names are at most 128 characters, without `;` or `#`.
`_overlap` is reserved: the group's overlap units. A unit can be in several
sets of a group. Sets are not part of the unit's data (moving a unit is no
new unit version), and a change applies to running studies at once and syncs
the study's links (a link per set of a group).

### listSetGroups

`GET /study/:studyId/sets` → `SetGroupResponseSchema[]`: per group its sets,
each with its unit ids in order and `ordered` (positions were given). The
draft's sets; `?live=true`: the deployed ones (what coders and links get).

### putSetGroup

`PUT /study/:studyId/sets/:group` (`{ sets: [{ name, unitIds, ordered? }] }`)
→ `SetGroupResponseSchema`. Makes or replaces the whole group. The unit ids
in order: the order coders get them in, for loops that don't shuffle. Only
the study's own units (400 otherwise).

### deleteSetGroup

`DELETE /study/:studyId/sets/:group` → 204. 409 while the deployed or latest
design uses the group (a loop's set, or a set-typed session parameter).

Splitting units into sets (`s1..sN`, plus `_overlap`) is done by the client
(`splitIntoSets` in `sets.ts`), which then writes the group with
[putSetGroup](#putsetgroup): the server only stores sets.

## Links and coders

Schemas: [`contracts/src/coder.ts`](../../packages/contracts/src/coder.ts).
Implementation: [`researcher/links.ts`](../../packages/server/src/researcher/links.ts), [`shared/links.ts`](../../packages/server/src/shared/links.ts), [`coders.ts`](../../packages/server/src/researcher/coders.ts), [`shared/progress.ts`](../../packages/server/src/shared/progress.ts).
See [`docs/coder-identity.md`](../coder-identity.md) for what links do.

Links are not created by hand: deploying makes one per
combination of the design's link parameter values (one if it has none),
and deploying set changes syncs them ([putDeployment](#putdeployment)): links follow the deployed sets. A link no
longer made is **retired** (`retiredAt`), never deleted: new coders get 403
`link_inactive`, coders who started keep working. It comes back, with the
same secret, if its combination returns.

### listLinks

`GET /study/:studyId/links` → `LinkResponseSchema[]`, active links
first, with `params` (the link parameter values it carries), `uses`,
`created`, `revokedAt` and `retiredAt`.

### updateLink

`PUT /study/:studyId/links/:id` (`LinkWriteSchema`) →
`LinkResponseSchema`. Who may use the link: `label`, `auth`
(`none`, `optional`, `required`), `emails`, `maxUses` and a fixed
`participantId`. Full replace of these settings.

### revokeLink

`POST /study/:studyId/links/:id/revoke` → `LinkResponseSchema`. No new
coders from this link; coders who already started keep working.

### renewLinkSecret

`POST /study/:studyId/links/:id/secret` → `LinkResponseSchema`. A new
secret: the old address stops working (e.g. it was shared too widely);
coders who already started keep working.

### listCoders

`GET /study/:studyId/coders` → `CoderProgressSchema[]`: per coder the link,
participant id, started, last active, live answers, finished units per
loop of the live design version, `special`: the units of the deployed
`_overlap`, `_gold` and `_practice` sets they finished, of how many (for
the kinds the study has), `variables`: their coder-level values
(answers outside unit loops, and `auto` variables: random or balanced
conditions), `session`: their `$session` values (link and URL parameters,
`source`), `ended`: how the
session ended (at an `end` item: item, outcome `screenout` or `complete`;
or outcome `quit`; and the time), or null, and `deletionRequest`: the
coder's request to delete their answers (`at`, `postponedAt` once the
researcher chose to delete later), or null.

### deleteCoders

`POST /study/:studyId/coders/delete` (`DeleteCodersSchema`: `{ coderIds?,
participantIds?, emails? }`, at least one) → `{ coderIds, answers }`. ADMIN.
Deletes the matching coders of the study and all their answers, also reset
ones, for good (a participant withdrew; docs/coder-identity.md §8). Units
nobody has answers for any more can be deleted again; unit versions stay.
Each deleted coder is logged (listCoderDeletions); `deletedBy` is the
researcher's email.

### postponeDeletion

`POST /study/:studyId/coders/:id/deletion-request/postpone` → 204 (404 without a
request). ADMIN. Delete later: sets `postponedAt` on the request, which the
UI then no longer brings up. The request stays until the coder is deleted.

### listCoderDeletions

`GET /study/:studyId/coders/deletions` → `CoderDeletionSchema[]`, newest first:
per deleted coder `coderId`, `participantId`, `email`, `requestedAt` (if
they asked), `deletedAt`, `deletedBy` and `answers` (rows deleted). Kept
after the data is gone, with the ids downloaded results use, so the coder
can be deleted from those too.

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
(`docs/plans/design.md` §5):

1. check that the design version passes validation (400 with `issues` if not:
   drafts may be saved with issues, coders only get valid designs);
2. with `units`: new versions of the units the draft changed (versions
   they replace that no answer points to are deleted), and the draft's
   sets become the deployed ones;
3. store it, bump `version` if the design version or the units changed (pausing
   and resuming don't: coders don't reload), record the version with what
   it changed ([listDeploymentVersions](#listdeploymentversions)), and make
   the design version immutable;
4. sync the study's links: one per combination of the design's link
   parameter values; links no longer made are retired. Above 500 links this
   needs `confirmLinks: true` (409 `confirm_links` otherwise), and more
   than 2000 is 400 `too_many_links`. The response's `links` is the number
   of active links;
5. bump the deployment's revision, so every server process re-reads it on
   its next request.

Paused (`active: false`): coders save what they have open, but get no new
units and no new sessions (409 `study_paused`; the coding screen says the
study is paused) until it is resumed.

Return `warnings` the researcher should see, e.g. a loop that gained
questions, which makes units coders finished unfinished again, or a group
with fewer overlap units than a loop expects.

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
and set (`set`: `group/set`, or `__all__` for all units) the units complete, started and leased, codings and coders,
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
of these variables (optionally only some units or coders): kept for
analysis, but they no longer count, so the units are coded again. Bumps
the deployment's `annotationEpoch`: runtimes re-read it and derive the
finished codings again. Only answers to units are reset.

## Annotations

Schemas: [`contracts/src/annotations.ts`](../../packages/contracts/src/annotations.ts).
Implementation: [`researcher/annotations.ts`](../../packages/server/src/researcher/annotations.ts).

### listAnnotations

`GET /study/:studyId/annotations?after=&limit=&retired=` → `AnnotationPageSchema`:
one row per answer: unit, coder and variable (`value` is a
`VariableValue`), with the unit's `externalId`, the coder's
`participantId`, the design version it was answered under, the unit
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

