# Researcher API

Served by the **server** at `/job/...`, called by the client's **researcher
UI** (`ResearcherApi`), and by scripts (R, Python) and other systems (AmCAT):
managing jobs, codebooks, units, invitations, publishing and progress.

- Contracts: `researcherEndpoints` in
  [`contracts/src/endpoints/researcher.ts`](../../packages/contracts/src/endpoints/researcher.ts).
- Implementation: [`server/src/researcher/`](../../packages/server/src/researcher/), one file per
  path, with shared queries in [`shared/`](../../packages/server/src/shared/).
- Caller: [`client/src/lib/api/httpResearcherApi.ts`](../../packages/client/src/lib/api/httpResearcherApi.ts).

**Authentication.** Every request carries a researcher's personal API key:
`authorization: Bearer <key>` (keys start with `atk_`). A key identifies a
user by email. There is no researcher login yet, so the first key comes from
the server's machine (`pnpm --filter @annotinder/server keys create --email
<email>`, see the server's README); with a key, a researcher can make more
([createApiKey](#createapikey)). Implementation:
[`researcher/auth.ts`](../../packages/server/src/researcher/auth.ts),
[`shared/accounts.ts`](../../packages/server/src/shared/accounts.ts).

Development only: a server started with `ANNOTINDER_DEV_AUTH=1` (as `pnpm
dev` does) also accepts `x-dev-role` / `x-dev-email` headers instead of a
key, which the dev shell's researcher UI uses. Never on a reachable server.

**Roles.** A user has a role per job (job users): `READ` < `WRITE` <
`ADMIN`. The role column below is the minimum. Whoever creates a job is its
`ADMIN`.

**Errors** are `{ error }` with a 4xx/5xx status: 400 invalid body or
parameter, 401 no valid API key, 403 no (sufficient) role in the job, 404
not found, 409 not allowed in this state (e.g. editing a published
codebook).

**From R or Python**: everything a script needs is here: create a job,
upload units ([createUnits](#createunits)) and a codebook, publish it,
invite coders, then download the annotations ([listAnnotations](#listannotations))
and the coders with their coder-level answers ([listCoders](#listcoders)).
`server/src/__tests__/researcherApi.test.ts` does exactly this, with every
response checked against its contract schema.

| Endpoint | | Role | Request | Response |
|---|---|---|---|---|
| **Account** | | | | |
| [getMe](#getme) | `GET /me` | any | – | `MeResponseSchema` |
| [listApiKeys](#listapikeys) | `GET /me/keys` | any | – | `ApiKeyResponseSchema[]` |
| [createApiKey](#createapikey) | `POST /me/keys` | any | `ApiKeyWriteSchema` | `ApiKeyCreatedSchema` |
| [revokeApiKey](#revokeapikey) | `POST /me/keys/:id/revoke` | any | – | `ApiKeyResponseSchema` |
| **Jobs** | | | | |
| [listJobs](#listjobs) | `GET /job` | any | – | `JobResponseSchema[]` |
| [createJob](#createjob) | `POST /job` | any | `JobWriteSchema` | `JobResponseSchema` |
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
| [listCoders](#listcoders) | `GET /job/:jobId/coders` | WRITE | – | `CoderProgressSchema[]` |
| **Publishing** | | | | |
| [getDeployment](#getdeployment) | `GET /job/:jobId/deployment` | READ | – | `DeploymentResponseSchema \| null` |
| [putDeployment](#putdeployment) | `PUT /job/:jobId/deployment` | ADMIN | `DeploymentWriteSchema` | `DeploymentResponseSchema` |
| [getDeploymentStatus](#getdeploymentstatus) | `GET /job/:jobId/deployment/status` | READ | – | `DeploymentStatusSchema` |
| [refreshDeployment](#refreshdeployment) | `POST /job/:jobId/deployment/refresh` | ADMIN | `RefreshDeploymentSchema` | `{ version }` |
| [createPreview](#createpreview) | `POST /job/:jobId/deployment/preview` | WRITE | – | `PreviewSessionSchema` |
| [resetAnnotations](#resetannotations) | `POST /job/:jobId/annotations/reset` | ADMIN | `ResetAnnotationsSchema` | `{ retired }` |
| **Annotations** | | | | |
| [listAnnotations](#listannotations) | `GET /job/:jobId/annotations` | READ | query `AnnotationsQuerySchema` | `AnnotationPageSchema` |

## Account

Schemas: [`contracts/src/account.ts`](../../packages/contracts/src/account.ts).
Implementation: [`researcher/me.ts`](../../packages/server/src/researcher/me.ts),
[`shared/accounts.ts`](../../packages/server/src/shared/accounts.ts).

### getMe

`GET /me` → `MeResponseSchema`: the email the request is authenticated as.

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

`POST /job` → `JobResponseSchema` (201). The creator becomes its `ADMIN`.
(With development headers the job has no job users, which lets any
development role in.)

### getJob

`GET /job/:id` → `JobResponseSchema`.

### updateJob

`PUT /job/:id` → `JobResponseSchema`. Rename, or set `archived` (hidden from active lists).

### deleteJob

`DELETE /job/:id` → 204. Removes the job and everything in it.

### getJobUsers

`GET /job/:id/users` → `JobUserSchema[]`: email and role per user.

### putJobUsers

`PUT /job/:id/users` → 204. Replaces the whole list.

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
([`docs/plan-codebook-publishing.md`](../plan-codebook-publishing.md)).
Schemas: [`contracts/src/codebook/codebook.ts`](../../packages/contracts/src/codebook/codebook.ts).
Implementation: [`researcher/codebook.ts`](../../packages/server/src/researcher/codebook.ts), [`codebook.$id.ts`](../../packages/server/src/researcher/codebook.$id.ts).

### listCodebooks

`GET /job/:jobId/codebook` → `CodebookMetaSchema[]` (id, note, created,
immutable), oldest first: the position is the version number.

### getCodebook

`GET /job/:jobId/codebook/:id` → `CodebookResponseSchema`: the whole document.

### createCodebook

`POST /job/:jobId/codebook` → `CodebookResponseSchema` (201). A new version.
Validate `items` with `CodebookItemsSchema` (nesting rules, unique names);
the body is always the full document, with an optional `note` (what changed).

### updateCodebook

`PUT /job/:jobId/codebook/:id` → `CodebookResponseSchema`. Full replace of
items and note. 409 once `immutable` (published).

### deleteCodebook

`DELETE /job/:jobId/codebook/:id` → 204. Discards a draft. 409 once `immutable`.

## Units and unitsets

Schemas: [`contracts/src/unit.ts`](../../packages/contracts/src/unit.ts), [`unitFields.ts`](../../packages/contracts/src/unitFields.ts), [`unitset.ts`](../../packages/contracts/src/unitset.ts).
Implementation: [`researcher/units*.ts`](../../packages/server/src/researcher/), [`unitsets*.ts`](../../packages/server/src/researcher/).

**Unit fields.** All units of a job have the same fields, each `text`,
`number` or `boolean`; values are stored typed (`42`, not `"42"`), and `null`
is an empty value of any type. The first upload sets the fields
(`fieldsOfUnits` in `unitFields.ts`); later uploads must have exactly those
fields with fitting values (`checkUnitData`). Deleting all units resets them.
Clients infer the types of CSV columns (`inferFieldType`) and send typed
values.

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
first upload sets them. An existing external id is a 409, unless
`overwrite: true`; an immutable unit (one that has answers) can't be
overwritten either way. A changed unit gets a new content hash.

### deleteUnit

`DELETE /job/:jobId/units/:id` → 204. 409 once immutable. Deleting the last
unit resets the fields.

### listUnitsets

`GET /job/:jobId/unitsets` → `UnitsetResponseSchema[]`: name and unit ids, in order.

### createUnitset

`POST /job/:jobId/unitsets` → `UnitsetResponseSchema` (201). The unit ids
in order: the order coders get them in, for loops that don't shuffle.

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
variables with `source: "invite"` for coders who use it.

### revokeInvite

`POST /job/:jobId/invites/:id/revoke` → `CoderInviteResponseSchema`. No new
coders from this invite; coders who already started keep working.

### deleteInvite

`DELETE /job/:jobId/invites/:id` → 204, only while unused: 409 once a coder
came in through it, since coders refer to their invite.

### listCoders

`GET /job/:jobId/coders` → `CoderProgressSchema[]`: per coder the invite,
participant id, started, last active, live answers, finished units per
loop of the live codebook, and `variables`: their coder-level values
(answers outside unit loops, and `auto` variables such as invite presets,
random or balanced conditions and URL parameters).

## Publishing

These change or read what coders get; status, refresh and preview go to the
job's runtime in memory (`server.deployments`). Schemas:
[`contracts/src/deployment.ts`](../../packages/contracts/src/deployment.ts).
Implementation: [`researcher/deployment*.ts`](../../packages/server/src/researcher/), [`shared/deployments.ts`](../../packages/server/src/shared/deployments.ts), [`runtime/registry.ts`](../../packages/server/src/runtime/registry.ts).

### getDeployment

`GET /job/:jobId/deployment` → `DeploymentResponseSchema | null`: the live
codebook id, `active`, `version`; null if never published.

### putDeployment

`PUT /job/:jobId/deployment` → `DeploymentResponseSchema`. Publish a
codebook version (or pause/resume with `active`):

1. store it, bump `version`, and make the codebook immutable;
2. have a loaded runtime re-read the deployment.

Return `warnings` the researcher should see, e.g. a loop that gained
questions, which makes units coders finished unfinished again.

### getDeploymentStatus

`GET /job/:jobId/deployment/status` → `DeploymentStatusSchema`: per loop
and unitset the units complete, started and leased, codings and coders,
plus what the runtime holds in memory. Computed on demand. 404 if not
published.

### refreshDeployment

`POST /job/:jobId/deployment/refresh` (`RefreshDeploymentSchema`) →
`{ version }`: re-read the deployment now; `units` (`"all"` or ids) also
drops cached unit content, e.g. after fixing a unit's text.

### createPreview

`POST /job/:jobId/deployment/preview` → `PreviewSessionSchema`. A preview of
the latest codebook (published or not), as deployment `<jobId>.preview`:
the real units, but coders and answers kept in memory only. The token (an
HMAC with the server's secret, valid 12 hours) is used like an invite
secret.

### resetAnnotations

`POST /job/:jobId/annotations/reset` → `{ retired }`. Retires the live values
of these variables (optionally only some units or coders): kept for
analysis, but they no longer count, so the units are coded again. Bump the
deployment's `annotationEpoch` and refresh the runtime.

## Annotations

Schemas: [`contracts/src/annotations.ts`](../../packages/contracts/src/annotations.ts).
Implementation: [`researcher/annotations.ts`](../../packages/server/src/researcher/annotations.ts).

### listAnnotations

`GET /job/:jobId/annotations?after=&limit=&retired=` → `AnnotationPageSchema`:
one row per unit, coder and variable (`value` is a `VariableValue`), with
the unit's `externalId`, the coder's `participantId`, the codebook version
it was answered under, and `created` / `updated`.

- **Paging**: rows come in the order they were first written (by `id`).
  `limit` rows per page (default 1000, at most 10000); pass `next` as
  `after` for the next page, until `next` is null. A page never changes once
  read, also while coders keep coding, so a script can keep `next` and
  fetch only what is new later.
- **Live values only**, unless `retired=true`: then also values that were
  reset or replaced, with `retiredAt`.
- Coder-level answers (outside unit loops) are not rows here; they come
  with the coders ([listCoders](#listcoders)).

