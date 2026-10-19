# @annotinder/reference-db-server

This package documents what a **db server** has to implement. 

A db server stores everything (jobs, codebooks, units, coders, answers) and
serves two APIs ([overview of all parts and APIs](../../docs/api/README.md)):

- the **annotator API**, for the job server, which runs the annotator.
- the **researcher API** (optional), for the client's researcher UI;

This package implements the annotator API, in memory, for one job loaded
from a fixture: one file per endpoint in [`src/annotator/`](src/annotator/),
named after its key in `annotatorEndpoints`; the data in
[`src/store.ts`](src/store.ts); job tokens in [`src/jobTokens.ts`](src/jobTokens.ts)
(reusable as is). It has no researcher API: the researcher API is
implemented by [`packages/mock-server`](../mock-server/src/routes/) (sqlite),
the dev db server, which implements both.

```sh
# serve job 1 from the conformance fixture, bound to the job server on :8788
JOB_SERVER_URL=http://localhost:8788 pnpm --filter @annotinder/reference-db-server dev
```

## Annotator API

Spec: [docs/api/annotator.md](../../docs/api/annotator.md). Checked by
`packages/conformance` (`DB_SERVER_URL=... pnpm conformance`). All paths under
`/annotator/job/:jobId`; every call but the first needs a job token.

| Endpoint | | Spec | Implementation |
|---|---|---|---|
| requestJobToken | `POST /token` | [spec](../../docs/api/annotator.md#requestjobtoken) | [requestJobToken.ts](src/annotator/requestJobToken.ts), [jobTokens.ts](src/jobTokens.ts) |
| *(job token check)* | all others | [spec](../../docs/api/annotator.md#authentication) | [requireJobToken.ts](src/annotator/requireJobToken.ts) |
| getDeployment | `GET /deployment` | [spec](../../docs/api/annotator.md#getdeployment) | [getDeployment.ts](src/annotator/getDeployment.ts) |
| getUnits | `GET /units?ids=` | [spec](../../docs/api/annotator.md#getunits) | [getUnits.ts](src/annotator/getUnits.ts) |
| listCoders | `GET /coders` | [spec](../../docs/api/annotator.md#listcoders) | [listCoders.ts](src/annotator/listCoders.ts) |
| resolveCoder | `POST /coders/resolve` | [spec](../../docs/api/annotator.md#resolvecoder) | [resolveCoder.ts](src/annotator/resolveCoder.ts) |
| putCoder | `PUT /coders/:coderId` | [spec](../../docs/api/annotator.md#putcoder) | [putCoder.ts](src/annotator/putCoder.ts) |
| listFinished | `POST /finished` | [spec](../../docs/api/annotator.md#listfinished) | [listFinished.ts](src/annotator/listFinished.ts) |
| listAnnotations | `GET /annotations?coderId=` | [spec](../../docs/api/annotator.md#listannotations) | [listAnnotations.ts](src/annotator/listAnnotations.ts) |
| putAnnotations | `POST /annotations` | [spec](../../docs/api/annotator.md#putannotations) | [putAnnotations.ts](src/annotator/putAnnotations.ts) |

A db server also **calls** the job server's [DB API](../../docs/api/db.md)
(refresh after publishing, status), signing calls with `signCall` from
`jobTokens.ts`.

## Researcher API

Spec: [docs/api/researcher.md](../../docs/api/researcher.md). Implementation:
the mock server ([`mock-server/src/routes/`](../mock-server/src/routes/)).

| Endpoints | Spec | Mock server |
|---|---|---|
| Jobs: listJobs, createJob, getJob, updateJob, deleteJob, getJobUsers, putJobUsers | [spec](../../docs/api/researcher.md#jobs) | [job.ts](../mock-server/src/routes/job.ts) |
| getOverview | [spec](../../docs/api/researcher.md#getoverview) | [coders.ts](../mock-server/src/routes/coders.ts), [progress.ts](../mock-server/src/db/progress.ts) |
| Codebooks: listCodebooks, getCodebook, createCodebook, updateCodebook, deleteCodebook | [spec](../../docs/api/researcher.md#codebooks) | [codebook.ts](../mock-server/src/routes/codebook.ts) |
| Units: listUnits, getUnitFields, listUnitPage, getUnit, createUnits, deleteUnit | [spec](../../docs/api/researcher.md#units-and-unitsets) | [units.ts](../mock-server/src/routes/units.ts) |
| Unitsets: listUnitsets, createUnitset, updateUnitset, deleteUnitset | [spec](../../docs/api/researcher.md#units-and-unitsets) | [unitsets.ts](../mock-server/src/routes/unitsets.ts) |
| Invitations: listInvites, createInvite, revokeInvite, deleteInvite | [spec](../../docs/api/researcher.md#invitations-and-coders) | [coders.ts](../mock-server/src/routes/coders.ts) |
| listCoders | [spec](../../docs/api/researcher.md#listcoders) | [coders.ts](../mock-server/src/routes/coders.ts), [progress.ts](../mock-server/src/db/progress.ts) |
| Publishing: getDeployment, putDeployment, getDeploymentStatus, refreshDeployment, createPreview, resetAnnotations | [spec](../../docs/api/researcher.md#publishing-and-the-job-server) | [deployment.ts](../mock-server/src/routes/deployment.ts) |

## Machine-readable

`pnpm --filter @annotinder/contracts generate:json-schema` writes a JSON
Schema per endpoint (`researcher-api.json`, `annotator-api.json`) for servers
not written in TypeScript.
