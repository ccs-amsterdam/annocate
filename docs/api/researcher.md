# Researcher API

Served by the **server** at `/job/...`, called by the client's **researcher
UI** (`ResearcherApi`), and by scripts (R, Python) and other systems (AmCAT):
managing jobs, codebooks, units, invitations, publishing and progress.

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

**Roles.** A user has a role per job (job users): `READ` < `WRITE` <
`ADMIN`. The role column below is the minimum. Whoever creates a job is its
`ADMIN`, and its owner. Apart from that, each user has an **account role**
on the server (`docs/accounts.md`): `user` (codes; works on jobs they have
a role in), `researcher` (also creates jobs, within their limits), `admin`
(also the [admin API](admin.md)).

**Second factor.** A server with `ANNOTINDER_REQUIRE_MFA=1` answers 403
`mfa_required` to a login that didn't use a second factor, except
`GET /me` (which says `mfaRequired`). API keys count as having one (making
one needs it).

**Limits.** Adding units, and creating a job, can be refused with 403
`limit_reached` (the job owner's limits), and a unit larger than the server
allows with 413 `unit_too_large`. A job a server admin suspended refuses
changes with 403 `job_suspended` (reading, deleting coders' data and
deleting the job still work).

**Errors** are `{ error, code? }` with a 4xx/5xx status: 400 invalid body or
parameter, 401 no valid API key, 403 no (sufficient) role in the job (or
account role: `researcher_required`), 404 not found, 409 not allowed in
this state (e.g. editing a published codebook), 413 too large.

**From R or Python**: everything a script needs is here: create a job,
upload units ([createUnits](#createunits)) and a codebook, publish it,
invite coders, then download the annotations ([listAnnotations](#listannotations))
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
| **Jobs** | | | | |
| [listJobs](#listjobs) | `GET /job` | any | – | `JobResponseSchema[]` |
| [createJob](#createjob) | `POST /job` | any | `JobWriteSchema` | `JobResponseSchema` |
| [listExamples](#listexamples) | `GET /examples` | any | – | `ExampleSummarySchema[]` |
| [createJobFromExample](#createjobfromexample) | `POST /job/from-example` | any | `JobFromExampleSchema` | `JobResponseSchema` |
| [createJobFromRecipe](#createjobfromrecipe) | `POST /job/from-recipe` | any | `RecipeSchema` | `JobResponseSchema` |
| [getJob](#getjob) | `GET /job/:id` | READ | – | `JobResponseSchema` |
| [updateJob](#updatejob) | `PUT /job/:id` | ADMIN | `JobWriteSchema` | `JobResponseSchema` |
| [deleteJob](#deletejob) | `DELETE /job/:id` | ADMIN | – | – |
| [getJobUsers](#getjobusers) | `GET /job/:id/users` | ADMIN | – | `JobUserSchema[]` |
| [putJobUsers](#putjobusers) | `PUT /job/:id/users` | ADMIN | `JobUsersWriteSchema` | – |
| [getOverview](#getoverview) | `GET /job/:jobId/overview` | READ | – | `JobOverviewSchema` |
| **Codebooks** | | | | |
| [listCodebooks](#listcodebooks) | `GET /job/:jobId/codebook` | READ | – | `CodebookMetaSchema[]` |
| [getCodebook](#getcodebook) | `GET /job/:jobId/codebook/:id` | READ | – | `CodebookResponseSchema` |
| [createCodebook](#createcodebook) | `POST /job/:jobId/codebook` | WRITE | `CodebookWriteSchema` | `CodebookResponseSchema` |
| [updateCodebook](#updatecodebook) | `PUT /job/:jobId/codebook/:id` | WRITE | `CodebookWriteSchema` | `CodebookResponseSchema` |
| [deleteCodebook](#deletecodebook) | `DELETE /job/:jobId/codebook/:id` | WRITE | – | – |
| **Units and unitsets** | | | | |
| [listUnits](#listunits) | `GET /job/:jobId/units` | READ | – | `UnitMetaSchema[]` |
| [getUnitFields](#getunitfields) | `GET /job/:jobId/units/fields` | READ | – | `UnitFieldSchema[]` |
| [listUnitPage](#listunitpage) | `GET /job/:jobId/units/page` | READ | – | `UnitPageSchema` |
| [getUnit](#getunit) | `GET /job/:jobId/units/:id` | READ | – | `UnitResponseSchema` |
| [createUnits](#createunits) | `POST /job/:jobId/units` | WRITE | `UnitsCreateBodySchema` | `UnitResponseSchema[]` |
| [deleteUnit](#deleteunit) | `DELETE /job/:jobId/units/:id` | WRITE | – | – |
| [listUnitsets](#listunitsets) | `GET /job/:jobId/unitsets` | READ | – | `UnitsetResponseSchema[]` |
| [createUnitset](#createunitset) | `POST /job/:jobId/unitsets` | WRITE | `UnitsetWriteSchema` | `UnitsetResponseSchema` |
| [updateUnitset](#updateunitset) | `PUT /job/:jobId/unitsets/:id` | WRITE | `UnitsetWriteSchema` | `UnitsetResponseSchema` |
| [deleteUnitset](#deleteunitset) | `DELETE /job/:jobId/unitsets/:id` | WRITE | – | – |
| **Invitations and coders** | | | | |
| [listInvites](#listinvites) | `GET /job/:jobId/invites` | WRITE | – | `CoderInviteResponseSchema[]` |
| [createInvite](#createinvite) | `POST /job/:jobId/invites` | WRITE | `CoderInviteWriteSchema` | `CoderInviteResponseSchema` |
| [revokeInvite](#revokeinvite) | `POST /job/:jobId/invites/:id/revoke` | WRITE | – | `CoderInviteResponseSchema` |
| [deleteInvite](#deleteinvite) | `DELETE /job/:jobId/invites/:id` | WRITE | – | – |
| [setInviteUnitset](#setinviteunitset) | `PUT /job/:jobId/invites/:id/unitset` | WRITE | `{ unitsetId }` | `CoderInviteResponseSchema` |
| [listCoders](#listcoders) | `GET /job/:jobId/coders` | READ | – | `CoderProgressSchema[]` |
| [deleteCoders](#deletecoders) | `POST /job/:jobId/coders/delete` | ADMIN | `DeleteCodersSchema` | `DeleteCodersResponseSchema` |
| [postponeDeletion](#postponedeletion) | `POST /job/:jobId/coders/:id/deletion-request/postpone` | ADMIN | – | – |
| [listCoderDeletions](#listcoderdeletions) | `GET /job/:jobId/coders/deletions` | READ | – | `CoderDeletionSchema[]` |
| **Publishing** | | | | |
| [getDeployment](#getdeployment) | `GET /job/:jobId/deployment` | READ | – | `DeploymentResponseSchema \| null` |
| [putDeployment](#putdeployment) | `PUT /job/:jobId/deployment` | ADMIN | `DeploymentWriteSchema` | `DeploymentResponseSchema` |
| [getDeploymentStatus](#getdeploymentstatus) | `GET /job/:jobId/deployment/status` | READ | – | `DeploymentStatusSchema` |
| [createPreview](#createpreview) | `POST /job/:jobId/deployment/preview` | WRITE | – | `PreviewSessionSchema` |
| [resetAnnotations](#resetannotations) | `POST /job/:jobId/annotations/reset` | ADMIN | `ResetAnnotationsSchema` | `{ retired }` |
| **Annotations** | | | | |
| [listAnnotations](#listannotations) | `GET /job/:jobId/annotations` | READ | query `AnnotationsQuerySchema` | `AnnotationPageSchema` |
| [listUnitVersions](#listunitversions) | `GET /job/:jobId/unit-versions` | READ | query `UnitVersionsQuerySchema` | `UnitVersionPageSchema` |
| [listDevices](#listdevices) | `GET /job/:jobId/devices` | READ | – | `DeviceSchema[]` |

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
provider; the provider redirects back to `/auth/callback`, which starts the
session and redirects to `returnTo`. A refused login comes back with
`?loginError=email_unverified|blocked|login_failed`
(`LoginErrorSchema`). Logging in also applies the server's registration
rules (`docs/accounts.md`): it can make a user a researcher or an admin.

### getMe

`GET /me` → `MeResponseSchema`: the email the request is authenticated as,
their account `role`, their `limits` and `usage` (jobs they own and their
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

## Jobs

Schemas: [`contracts/src/job.ts`](../../packages/contracts/src/job.ts), [`overview.ts`](../../packages/contracts/src/overview.ts).
Implementation: [`researcher/job.ts`](../../packages/server/src/researcher/job.ts), [`job.$id.ts`](../../packages/server/src/researcher/job.$id.ts), [`job.$id.users.ts`](../../packages/server/src/researcher/job.$id.users.ts), overview in [`overview.ts`](../../packages/server/src/researcher/overview.ts) / [`shared/progress.ts`](../../packages/server/src/shared/progress.ts).

### listJobs

`GET /job` → `JobResponseSchema[]`. The jobs the user has a role in (with
development headers: all jobs).

### createJob

`POST /job` → `JobResponseSchema` (201). Needs the account role
`researcher` (403 `researcher_required`), within their `jobs` limit (403
`limit_reached`). The creator owns it and becomes its `ADMIN`.
(With development headers the job has no job users, which lets any
development role in.)

### listExamples

`GET /examples` → `ExampleSummarySchema[]`: the example jobs this server
ships (`packages/server/examples/<id>.json`): id, category, title, what it
shows and what to try (`docs/plans/examples.md`).

### createJobFromExample

`POST /job/from-example` (`{ example, name? }`) → `JobResponseSchema`
(201): a new job from an example, like `createJob` (the same role, limits
and ownership): its units and unitsets, its codebook published, its
invitations, and its example answers (coders named "Example coder n").
The job's `origin` is the example's id. 404 for an unknown example.

### createJobFromRecipe

`POST /job/from-recipe` → `JobResponseSchema` (201): a new job from a
recipe (`contracts/src/recipe.ts`), as the setup wizard writes one, like
`createJob` (the same role, limits and ownership), in one transaction:

- `units` (`{ id, data }`; the first unit's fields become the job's) and
  `unitsets` (by the units' ids);
- `codebook` (`{ note?, items }`): the first version, saved as a draft that
  may have issues (e.g. questions without an answer type yet). With
  `publish: true` it is published, and must then pass validation;
- `invites`, as `createInvite` takes them, with `unitset` by name.

400 `recipe_invalid` for a unit id used twice, a unitset naming an unknown
unit, an invitation naming an unknown unitset, or a codebook to publish
that has issues; nothing is created then. Example jobs are recipes too
(`packages/server/examples/`), with example answers.

### getJob

`GET /job/:id` → `JobResponseSchema`.

### updateJob

`PUT /job/:id` → `JobResponseSchema`. Rename, set `archived` (hidden from
active lists), or `keepSessionsOpen`: finished coder sessions stay open
(off by default: `docs/coder-identity.md` §9). `JobResponseSchema` also has
`suspendedAt` (a server admin suspended the job).

### deleteJob

`DELETE /job/:id` → 204. Removes the job and everything in it.

### getJobUsers

`GET /job/:id/users` → `JobUserSchema[]`: email and role per user.

### putJobUsers

`PUT /job/:id/users` → 204. Replaces the whole list; it must keep at least one `ADMIN` (400 otherwise). Emails are stored lowercased, as accounts are; an email twice in the list is a 400.

### getOverview

`GET /job/:jobId/overview` → `JobOverviewSchema`. Counts for the overview
page: units, unitsets with sizes, coders (total, started, active in the last
24 hours), live answers, finished codings for the live codebook's loops, and
answers per day for the last 30 days. "Finished": every question of the
loop has a live answer.
Index answers by (job, created) to keep the per-day count cheap.

## Codebooks

Versions of the job's codebook, in order of creation. One is **live** (the
deployment's); the latest, if unpublished, is the **draft**
([`docs/client.md`](../client.md) §7).
Schemas: [`contracts/src/codebook/codebook.ts`](../../packages/contracts/src/codebook/codebook.ts).
Implementation: [`researcher/codebook.ts`](../../packages/server/src/researcher/codebook.ts), [`codebook.$id.ts`](../../packages/server/src/researcher/codebook.$id.ts).

### listCodebooks

`GET /job/:jobId/codebook` → `CodebookMetaSchema[]` (id, note, created,
immutable), oldest first: the position is the version number.

### getCodebook

`GET /job/:jobId/codebook/:id` → `CodebookResponseSchema`: the whole document.

### createCodebook

`POST /job/:jobId/codebook` → `CodebookResponseSchema` (201). A new version.
The body is always the full document, with an optional `note` (what
changed). A draft may be saved while it doesn't pass validation (work in
progress): `items` only has to be a list (`DraftItemsSchema`). The response says whether it is `valid`
(`CodebookItemsSchema`: nesting rules, unique names, references), which
publishing and previewing require. Codebooks also have `updated`,
`updatedBy` (the email of who saved last) and `revision`.

### updateCodebook

`PUT /job/:jobId/codebook/:id` → `CodebookResponseSchema`. Full replace of
items and note; bumps `revision`. 409 once `immutable` (published). With
`revision` (the revision the edits are based on): 409
`CodebookConflictSchema` (`code: "codebook_conflict"`, who saved when) if
someone saved since, instead of overwriting their work. Without it, the
save overwrites.

### deleteCodebook

`DELETE /job/:jobId/codebook/:id` → 204. Deletes a draft (for everyone; the
editor offers this only in the versions dialog). 409 once `immutable`.

## Units and unitsets

Schemas: [`contracts/src/unit.ts`](../../packages/contracts/src/unit.ts), [`unitFields.ts`](../../packages/contracts/src/unitFields.ts), [`unitset.ts`](../../packages/contracts/src/unitset.ts).
Implementation: [`researcher/units*.ts`](../../packages/server/src/researcher/), [`unitsets*.ts`](../../packages/server/src/researcher/).

**Unit fields.** All units of a job have the same fields, each `text`,
`number` or `boolean`; values are stored typed (`42`, not `"42"`), and `null`
is an empty value of any type. The first upload sets the fields
(`fieldsOfUnits` in `unitFields.ts`). A later upload must give every
existing field a fitting value (`checkUnitData`; `null` for empty) and may
add fields (`addedFields`): they are appended, and units already stored
have no value for them. New field names are letters, digits and `_`, not
starting with a digit (`UNIT_FIELD_NAME`), so codebooks can refer to them
as `$unit.<name>`. Deleting all units resets the fields. Clients infer the
types of CSV columns (`inferFieldType`) and send typed values.

### listUnits

`GET /job/:jobId/units` → `UnitMetaSchema[]`: id, external id and content
hash of every unit, without data.

### getUnitFields

`GET /job/:jobId/units/fields` → `UnitFieldSchema[]`: the job's fields, in
column order; empty without units. Match this static path (and `/units/page`)
before `/units/:id`.

### listUnitPage

`GET /job/:jobId/units/page?offset=0&limit=50&unitset=name` → `UnitPageSchema`:
a page of units with their data (`limit` at most 200) and the `total`. All
units by id, or with `unitset` that set's units in the set's order (404 for
an unknown set).

### getUnit

`GET /job/:jobId/units/:id` → `UnitResponseSchema`, with `data`.

### createUnits

`POST /job/:jobId/units` → `UnitResponseSchema[]` (201). Up to 200 per
call, all or nothing. Every unit's data must fit the job's fields (400 with
the first problem, e.g. `Unit 'u3': Field 'n' is number, got text`); the
first upload sets them, later ones may add fields. An existing external id is a 409, unless
`overwrite: true`; a unit that was coded (`coded`) also needs
`overwriteCoded: true`. Its answers keep the unit version their coder saw
([listUnitVersions](#listunitversions)); spans may no longer fit the new
text. A changed unit gets a new content hash, and coders get the new
content from then on.

### deleteUnit

`DELETE /job/:jobId/units/:id` → 204. 409 once coded (replace it
instead). Deleting the last unit resets the fields.

### listUnitsets

`GET /job/:jobId/unitsets` → `UnitsetResponseSchema[]`: name and unit ids, in order.

### createUnitset

`POST /job/:jobId/unitsets` → `UnitsetResponseSchema` (201). The unit ids
in order: the order coders get them in, for loops that don't shuffle. Only
the job's own units (400 otherwise).

### updateUnitset

`PUT /job/:jobId/unitsets/:id` → `UnitsetResponseSchema`. Full replace.

### deleteUnitset

`DELETE /job/:jobId/unitsets/:id` → 204. 409 while a codebook's `unit_loop`
refers to it.

Splitting units into sets (`<prefix>_1..n`, plus an overlap set) is done by
the client (`splitUnits` in `unitset.ts`), which then creates each set with
[createUnitset](#createunitset): the server only stores unitsets.

## Invitations and coders

Schemas: [`contracts/src/coder.ts`](../../packages/contracts/src/coder.ts).
Implementation: [`researcher/invites*.ts`](../../packages/server/src/researcher/), [`coders.ts`](../../packages/server/src/researcher/coders.ts), [`shared/progress.ts`](../../packages/server/src/shared/progress.ts).
See [`docs/coder-identity.md`](../coder-identity.md) for what invitations do.

### listInvites

`GET /job/:jobId/invites` → `CoderInviteResponseSchema[]`, with `uses`,
`created` and `revokedAt`.

### createInvite

`POST /job/:jobId/invites` → `CoderInviteResponseSchema` (201). Generates
the `secret` for the link. `variables` presets the codebook's `auto`
variables with `source: "invite"` for coders who use it; `unitsetId` is the
unitset its coders get in loops with `mode: "invitation"`.

### revokeInvite

`POST /job/:jobId/invites/:id/revoke` → `CoderInviteResponseSchema`. No new
coders from this invite; coders who already started keep working.

### deleteInvite

`DELETE /job/:jobId/invites/:id` → 204, only while unused: 409 once a coder
came in through it, since coders refer to their invite.

### setInviteUnitset

`PUT /job/:jobId/invites/:id/unitset` (`{ unitsetId: number | null }`) →
`CoderInviteResponseSchema`. The unitset the invite's coders get in loops
with `mode: "invitation"`; null for none. Coders already routed keep their
units. A unitset an invite uses can't be deleted (409).

### listCoders

`GET /job/:jobId/coders` → `CoderProgressSchema[]`: per coder the invite,
participant id, started, last active, live answers, finished units per
loop of the live codebook, and `variables`: their coder-level values
(answers outside unit loops, and `auto` variables such as invite presets,
random or balanced conditions and URL parameters), `ended`: how the
session ended (at an `end` item: item, outcome `screenout` or `complete`;
or outcome `quit`; and the time), or null, and `deletionRequest`: the
coder's request to delete their answers (`at`, `postponedAt` once the
researcher chose to delete later), or null.

### deleteCoders

`POST /job/:jobId/coders/delete` (`DeleteCodersSchema`: `{ coderIds?,
participantIds?, emails? }`, at least one) → `{ coderIds, answers }`. ADMIN.
Deletes the matching coders of the job and all their answers, also reset
ones, for good (a participant withdrew; docs/coder-identity.md §8). Units
nobody has answers for any more can be deleted again; unit versions stay.
Each deleted coder is logged (listCoderDeletions); `deletedBy` is the
researcher's email.

### postponeDeletion

`POST /job/:jobId/coders/:id/deletion-request/postpone` → 204 (404 without a
request). ADMIN. Delete later: sets `postponedAt` on the request, which the
UI then no longer brings up. The request stays until the coder is deleted.

### listCoderDeletions

`GET /job/:jobId/coders/deletions` → `CoderDeletionSchema[]`, newest first:
per deleted coder `coderId`, `participantId`, `email`, `requestedAt` (if
they asked), `deletedAt`, `deletedBy` and `answers` (rows deleted). Kept
after the data is gone, with the ids downloaded results use, so the coder
can be deleted from those too.

## Publishing

These change or read what coders get; status and preview go to the job's
runtime (`server.deployments`). Schemas:
[`contracts/src/deployment.ts`](../../packages/contracts/src/deployment.ts).
Implementation: [`researcher/deployment*.ts`](../../packages/server/src/researcher/), [`shared/deployments.ts`](../../packages/server/src/shared/deployments.ts), [`runtime/registry.ts`](../../packages/server/src/runtime/registry.ts).

### getDeployment

`GET /job/:jobId/deployment` → `DeploymentResponseSchema | null`: the live
codebook id, `active`, `version`; null if never published.

### putDeployment

`PUT /job/:jobId/deployment` → `DeploymentResponseSchema`. Publish a
codebook version (or pause/resume with `active`):

1. check that the codebook passes validation (400 with `issues` if not:
   drafts may be saved with issues, coders only get valid codebooks);
2. store it, bump `version` if the codebook version changed (pausing and
   resuming don't: coders don't reload), and make the codebook immutable;
3. bump the deployment's revision, so every server process re-reads it on
   its next request.

Paused (`active: false`): coders save what they have open, but get no new
units and no new sessions (409 `job_paused`; the coding screen says the
study is paused) until it is resumed.

Return `warnings` the researcher should see, e.g. a loop that gained
questions, which makes units coders finished unfinished again.

### getDeploymentStatus

`GET /job/:jobId/deployment/status` → `DeploymentStatusSchema`: per loop
and unitset the units complete, started and leased, codings and coders,
computed on demand. 404 if not
published.

### createPreview

`POST /job/:jobId/deployment/preview` → `PreviewSessionSchema`. A preview of
the latest codebook (published or not), as deployment `<jobId>.preview`:
the real units, but coders and answers kept in memory only. The token (an
HMAC with the server's secret, valid 12 hours) is used like an invite
secret. A latest codebook with validation issues can't be previewed: the
preview's coder API answers 409 `codebook_invalid`.

### resetAnnotations

`POST /job/:jobId/annotations/reset` → `{ retired }`. Retires the live values
of these variables (optionally only some units or coders): kept for
analysis, but they no longer count, so the units are coded again. Bumps
the deployment's `annotationEpoch`: runtimes re-read it and derive the
finished codings again. Only answers to units are reset.

## Annotations

Schemas: [`contracts/src/annotations.ts`](../../packages/contracts/src/annotations.ts).
Implementation: [`researcher/annotations.ts`](../../packages/server/src/researcher/annotations.ts).

### listAnnotations

`GET /job/:jobId/annotations?after=&limit=&retired=` → `AnnotationPageSchema`:
one row per answer: unit, coder and variable (`value` is a
`VariableValue`), with the unit's `externalId`, the coder's
`participantId`, the codebook version it was answered under, the unit
version the coder saw (`unitVersionId`), the device (`deviceId`), how
long the coder took as their browser measured it (`timing`), for unit
answers when the server first handed the unit to the coder (`servedAt`),
and `created` / `updated`. Answers outside unit loops (survey questions) are
rows too, with `unitId` null; so are values the server assigned (invite
presets, random or balanced groups, URL parameters), marked `assigned`.

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

`GET /job/:jobId/unit-versions?after=&limit=` → `UnitVersionPageSchema`:
units as coders saw them (`architecture.md` §8.4), one row per version:
the unit's id and `externalId`, a `hash`, the `data` shown (only the
fields the codebook used), and when it was first shown. Paged like
annotations. Join answers on `unitVersionId`.

### listDevices

`GET /job/:jobId/devices` → `DeviceSchema[]`: the devices coders used
(`coder-identity.md` §4), each with its coder, coarse `type` (phone,
tablet, desktop), `browser`, `os`, and when it joined the session. Answers
carry the device they were given on (`deviceId` in `listAnnotations`).

