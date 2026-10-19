# The APIs: how the parts talk

Annotinder has three parts: the **client** (browser), a **db server** (any
language; stores everything) and the **job server** (TypeScript; runs the
annotator). They talk through four APIs, two served by each server.

```
 client (browser)
 ┌───────────────────────────────┐        ┌──────────────────────────────┐
 │ researcher UI   (AdminClient) │        │ annotator    (HttpJobServer) │
 └───────────────┬───────────────┘        └───────────────┬──────────────┘
                 │ researcher API                         │ client API
                 ▼                                        ▼
 ┌───────────────────────────────┐        ┌──────────────────────────────┐
 │ db server                     │        │ job server                   │
 │                               │        │                              │
 │  researcher API  /job/...     │        │  client API  /d/<deployment> │
 │  annotator API   /annotator/  │◄───────│  (AnnotatorClient)           │
 │                               │───────►│  DB API      /db/...         │
 └───────────────────────────────┘        └──────────────────────────────┘
```

| API | Served by | Called by | For | Contracts | Spec |
|---|---|---|---|---|---|
| **researcher API** | db server | client: researcher UI (`AdminClient`) | managing jobs: codebooks, units, invitations, publishing, progress | `researcherEndpoints` | [researcher.md](researcher.md) |
| **annotator API** | db server | job server (`AnnotatorClient`) | everything the job server needs to run the annotator: the deployed codebook, units, coders, answers | `annotatorEndpoints` | [annotator.md](annotator.md) |
| **client API** | job server | client: annotator (`HttpJobServer`, `JobManager`) | coding: session, next unit, submitting answers | `clientEndpoints` | [client.md](client.md) |
| **DB API** | job server | db server | telling the job server about changes (refresh), progress (status) | `dbEndpoints` | [db.md](db.md) |

The registries are in `packages/contracts/src/endpoints/`: one file per API,
each entry `{ method, path, request, response }` with zod schemas.

## Who implements what

- **A db server** implements the researcher API and the annotator API.
  [`packages/reference-db-server`](../../packages/reference-db-server/README.md)
  lists every endpoint a db server needs, with links to each one's spec and
  implementation. It implements the annotator API itself (in memory, one
  file per endpoint); the researcher API is implemented by
  `packages/mock-server`, the dev db server (sqlite), which implements both.
- **The job server** (`packages/job-server`) implements the client API and
  the DB API. There is one implementation; db servers don't build their own.
- **The client** (`packages/client`) calls the researcher API
  (`api/httpAdminClient.ts`) and the client API (`api/httpJobServer.ts`).

## Authentication per link

| Link | How |
|---|---|
| researcher UI → researcher API | The db server's own login (SSO, sessions, ...); the contract only assumes job users with a role per job: `READ`, `WRITE` or `ADMIN`. The mock server trusts `x-dev-role` / `x-dev-email` headers (dev only). |
| job server → annotator API | A **job token** per job: the job server asks for one with a request signed with its Ed25519 key (`requestJobToken`), then sends it as `authorization: Bearer <token>`. The db server only issues tokens to the job server the job is bound to. [annotator.md#authentication](annotator.md#authentication) |
| db server → DB API | Signed with the job's **call key** (from the job token) in `x-annotinder-signature`. [db.md#authentication](db.md#authentication) |
| annotator → client API | A session cookie the job server sets (httpOnly, same origin as the client), created from an invite secret. [client.md#sessions-and-headers](client.md#sessions-and-headers) |

Coders never talk to the db server, and researchers never talk to the job
server: researcher actions that involve the job server (status, refresh,
preview) go through the db server, which calls the DB API.

## Deployment ids

A job runs on a job server as a **deployment**, identified as
`<db host>/<jobId>`, e.g. `amcat.nl/42` (port included if not the default).
The job server finds the db server from the id alone: the annotator API is at
`https://<db host>/annotator/job/<jobId>/...`. A researcher preview runs as
`<db host>/<jobId>.preview`.

## Machine-readable spec

```sh
pnpm --filter @annotinder/contracts generate:json-schema
```

writes `packages/contracts/dist/json-schema/{researcher,annotator,client,db}-api.json`:
per endpoint the method, path, and a JSON Schema for the request and
response body, for servers not written in TypeScript.

To check a db server's annotator API: `packages/conformance` (see the root
README).
