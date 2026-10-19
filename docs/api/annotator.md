# Annotator API

Served by a **db server**, called only by the **job server**: everything it
needs to run the annotator. Plain data access; the db server never runs
codebook logic (distribution, validation, "is this unit done") — the job
server does, and asks the db server for rows.

- Contracts: `annotatorEndpoints` in
  [`contracts/src/endpoints/annotator.ts`](../../packages/contracts/src/endpoints/annotator.ts);
  schemas in [`contracts/src/deployment.ts`](../../packages/contracts/src/deployment.ts).
- Reference implementation: [`reference-db-server/src/annotator/`](../../packages/reference-db-server/src/annotator/),
  one file per endpoint (in memory). Also the mock server:
  [`mock-server/src/routes/annotator.ts`](../../packages/mock-server/src/routes/annotator.ts) (sqlite).
- Caller: [`job-server/src/annotatorClient.ts`](../../packages/job-server/src/annotatorClient.ts).
- Conformance suite: `packages/conformance` checks any db server over HTTP.

All paths are under `/annotator/job/:jobId`.

| Endpoint | | Request | Response |
|---|---|---|---|
| [requestJobToken](#requestjobtoken) | `POST /token` | `JobTokenRequestSchema` | `JobTokenResponseSchema` |
| [getDeployment](#getdeployment) | `GET /deployment` | – | `DeploymentSpecSchema` |
| [getUnits](#getunits) | `GET /units?ids=1,2` | – | `AnnotatorUnitSchema[]` |
| [listCoders](#listcoders) | `GET /coders` | – | `AnnotatorCoderSchema[]` |
| [resolveCoder](#resolvecoder) | `POST /coders/resolve` | `ResolveCoderRequestSchema` | `AnnotatorCoderSchema` |
| [putCoder](#putcoder) | `PUT /coders/:coderId` | `AnnotatorCoderWriteSchema` | – |
| [listFinished](#listfinished) | `POST /finished` | `FinishedRequestSchema` | `AnnotatorFinishedSchema[]` |
| [listAnnotations](#listannotations) | `GET /annotations?coderId=X` | – | `AnnotatorAnnotationSchema[]` |
| [putAnnotations](#putannotations) | `POST /annotations` | `AnnotatorAnnotationBatchSchema` | `AnnotatorAnnotationBatchResultSchema` |

## Data model

What a db server stores for this API (the reference server's
[`store.ts`](../../packages/reference-db-server/src/store.ts) is the minimal version):

- **Deployment**: which codebook version is live, `active`, a `version`
  bumped on every change, and the job server the job is bound to.
- **Units**: id, external id, data, and a content hash.
- **Invites** and **coders**: a coder has a coder key (from the job server),
  an optional participant id, and loop `assignments`.
- **Values**: one row per (unit, coder, variable), or (coder, variable) for
  coder-level values. Never deleted: a reset *retires* a row, and only live
  rows count.

## Authentication

Every call except `requestJobToken` carries a job token:
`authorization: Bearer <token>`. Refuse a missing, expired or foreign token
(another job, or issued to another job server) with
`401 { error, code: "invalid_job_token" }`; the job server then gets a new
token and retries once. Implementation:
[`requireJobToken.ts`](../../packages/reference-db-server/src/annotator/requireJobToken.ts),
token checks in [`jobTokens.ts`](../../packages/reference-db-server/src/jobTokens.ts).

## Endpoints

### requestJobToken

`POST /annotator/job/:jobId/token` → `JobTokenResponseSchema`

How a job server gets authenticated; no shared secret. The body is a JWT the
job server signed with its Ed25519 key. Check:

1. the job exists and is bound to a job server, and that is the JWT's `iss`;
2. `aud` is this db server, `jobId` matches, the time window is valid;
3. the signature, with the keys at `<iss>/.well-known/jwks.json`.

Return a job token: HS256 with the db server's secret, claims `jobId`,
`aud`, `exp` and `ck` (the job's **call key**, used to sign
[DB API](db.md) calls). 404 if the job doesn't exist or has no job server;
any other failure 401.

Implementation: [`requestJobToken.ts`](../../packages/reference-db-server/src/annotator/requestJobToken.ts),
[`jobTokens.ts`](../../packages/reference-db-server/src/jobTokens.ts) (all of the db server's side, reusable).

### getDeployment

`GET /annotator/job/:jobId/deployment` → `DeploymentSpecSchema`

Everything the job server needs to run the job, minus unit content: the
live codebook, all unitsets plus `__all__` (every unit id), `version`,
`active`, and `annotationEpoch` (bump it when answers change outside the job
server, e.g. a reset). 404 if not deployed.

`?preview=1`: the latest codebook, deployed or not, `active: true`, with a
`version` that changes with its content (for researcher previews).

Implementation: [`getDeployment.ts`](../../packages/reference-db-server/src/annotator/getDeployment.ts).

### getUnits

`GET /annotator/job/:jobId/units?ids=1,2,3` → `AnnotatorUnitSchema[]`

Unit content for the job server's cache. Unknown ids are left out. `hash`
is opaque to the job server, but must change whenever `data` does: it is
sent back with answers.

Implementation: [`getUnits.ts`](../../packages/reference-db-server/src/annotator/getUnits.ts).

### listCoders

`GET /annotator/job/:jobId/coders` → `AnnotatorCoderSchema[]`

All coders with their coder-level values and loop assignments, never
emails. Only for researcher status, on demand; the job server loads coders
one at a time through `resolveCoder`.

Implementation: [`listCoders.ts`](../../packages/reference-db-server/src/annotator/listCoders.ts).

### resolveCoder

`POST /annotator/job/:jobId/coders/resolve` → `AnnotatorCoderSchema`

The coder for a coder key. An unknown key needs a valid `inviteSecret`: then
create the coder, copying the invite's preset `variables` as coder-level
values (`{ done: true, codes: [{ code }] }`), and count a use. Refuse:

- an unknown key without a valid invite, a revoked or used-up invite: 401;
- an invite that requires login (not supported yet): 401 `auth_required`;
- a participant id that already has a coder, unless `newSession: true`:
  409 `participant_has_session`. A new session of a known participant
  doesn't use up the invite.

The participant id is the invite's own, or (with `participantFromUrl`) the
one in the request. See [`docs/coder-identity.md`](../coder-identity.md).

Implementation: [`resolveCoder.ts`](../../packages/reference-db-server/src/annotator/resolveCoder.ts).

### putCoder

`PUT /annotator/job/:jobId/coders/:coderId` (`AnnotatorCoderWriteSchema`) → 204

Full replace of a coder's coder-level values and loop `assignments` (sticky
routing). Values not in the body are retired. 404 for an unknown coder.

Implementation: [`putCoder.ts`](../../packages/reference-db-server/src/annotator/putCoder.ts).

### listFinished

`POST /annotator/job/:jobId/finished` (`FinishedRequestSchema`) → `AnnotatorFinishedSchema[]`

The bulk query, used on cold start and for status. Per group of variables
(`loops`), the rows where **every** variable has a live value, oldest first
(`created`: the earliest of those values):

- `level: "unit"` (default): per (unit, coder), e.g. a loop's finished units;
- `level: "coder"`: per coder over coder-level values (`unitId: null`), e.g.
  `balanced` counts.

`values`: also return these variables' values for each row (e.g. agreement
variables). `coderId`: only that coder. The db server only filters; the job
server decides the groups and does the counting.

Implementation: [`listFinished.ts`](../../packages/reference-db-server/src/annotator/listFinished.ts).

### listAnnotations

`GET /annotator/job/:jobId/annotations?coderId=X` → `AnnotatorAnnotationSchema[]`

One coder's live unit-level values, grouped per unit, ordered by first
write. Coder-level values come with the coder instead. 400 without `coderId`.

Implementation: [`listAnnotations.ts`](../../packages/reference-db-server/src/annotator/listAnnotations.ts).

### putAnnotations

`POST /annotator/job/:jobId/annotations` (`AnnotatorAnnotationBatchSchema`) → `AnnotatorAnnotationBatchResultSchema`

The job server's buffered writes (about once a minute), applied **in
order**. Each upserts a live value per given variable; other variables of
that unit and coder are left alone. Store `codebookId` and `unitHash` (the
hash of the content the coder was shown) as given; never refuse a write for
its hash. Writes for unknown units or coders are skipped and listed in
`rejected` (by index); fail the call only if nothing could be stored.
Retrying a batch is harmless.

Implementation: [`putAnnotations.ts`](../../packages/reference-db-server/src/annotator/putAnnotations.ts).
