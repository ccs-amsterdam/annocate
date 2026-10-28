# The APIs: how the parts talk

Annotinder has two parts: the **client** (browser) and the **server**
(TypeScript, `packages/server`; stores everything and runs the jobs). The
server serves two APIs.

```
 ┌─────────────────────────────────┐   ┌──────────────────────────────┐
 │ researcher UI (ResearcherApi)   │   │ annotator (HttpCoderApi)     │
 │ scripts (R, Python), AmCAT      │   │                              │
 └────────────────┬────────────────┘   └───────────────┬──────────────┘
                  │ researcher API                      │ coder API
                  │ /job/..., /me, /auth/...            │ /d/<deploymentId>/...
                  ▼                                     ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │ server                                                              │
 └─────────────────────────────────────────────────────────────────────┘
```

| API | Called by | For | Contracts | Spec |
|---|---|---|---|---|
| **researcher API** | client: researcher UI (`ResearcherApi`); scripts (R, Python); other systems | managing jobs: codebooks, units, invitations, publishing, progress | `researcherEndpoints` | [researcher.md](researcher.md) |
| **coder API** | client: annotator (`HttpCoderApi`, `JobManager`) | coding: session, next unit, submitting answers | `coderEndpoints` | [coder.md](coder.md) |
| **admin API** | client: server admin page (`ServerApi`) | accounts: roles, registration, plans and limits, blocking, suspending jobs | `adminEndpoints` | [admin.md](admin.md) |

The registries are in `packages/contracts/src/endpoints/`: one file per API,
each entry `{ method, path, request, response }` with zod schemas.

## Where they are implemented

- **The server** (`packages/server`): the researcher API in
  `src/researcher/` (one file per path), the coder API in `src/coder.ts`,
  with the runtime in `src/runtime/` doing the work.
- **The client** (`packages/client`) calls the researcher API
  (`api/httpResearcherApi.ts`) and the coder API (`api/httpCoderApi.ts`).

## Authentication

| API | How |
|---|---|
| researcher API | The session cookie from logging in (same origin, with `x-annotinder: 1`), or a personal API key (`authorization: Bearer <key>`, also from other origins: CORS is allowed). The user's role per job is `READ`, `WRITE` or `ADMIN`. Development servers (`ANNOTINDER_DEV_AUTH=1`) also accept `x-dev-role` / `x-dev-email` headers. See [researcher.md](researcher.md). |
| coder API | A session cookie the server sets (httpOnly, same origin as the client), created from an invite secret. No CORS. [coder.md#sessions-and-headers](coder.md#sessions-and-headers) |

## Deployment ids

A deployed job runs as a **deployment**, identified by the job id, e.g.
`/d/42/session`. A researcher preview runs as `<jobId>.preview`.

## Machine-readable spec

```sh
pnpm --filter @annotinder/contracts generate:json-schema
```

writes `packages/contracts/dist/json-schema/{researcher,coder}-api.json`:
per endpoint the method, path, and a JSON Schema for the request and
response body, for clients not written in TypeScript (R, Python).
