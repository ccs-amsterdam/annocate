# The APIs: how the parts talk

Annotinder has two parts: the **client** (browser) and the **server**
(TypeScript, `packages/server`; stores everything and runs the annotator).
The server serves two APIs.

```
 client (browser), R, Python, other systems
 ┌───────────────────────────────┐        ┌──────────────────────────────┐
 │ researcher UI   (AdminClient) │        │ annotator    (HttpJobServer) │
 │ scripts, AmCAT                │        │                              │
 └───────────────┬───────────────┘        └───────────────┬──────────────┘
                 │ researcher API  /job/...               │ client API  /d/<deploymentId>/...
                 ▼                                        ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ server                                                                 │
 └────────────────────────────────────────────────────────────────────────┘
```

| API | Called by | For | Contracts | Spec |
|---|---|---|---|---|
| **researcher API** | client: researcher UI (`AdminClient`); scripts (R, Python); other systems | managing jobs: codebooks, units, invitations, publishing, progress | `researcherEndpoints` | [researcher.md](researcher.md) |
| **client API** | client: annotator (`HttpJobServer`, `JobManager`) | coding: session, next unit, submitting answers | `clientEndpoints` | [client.md](client.md) |

The registries are in `packages/contracts/src/endpoints/`: one file per API,
each entry `{ method, path, request, response }` with zod schemas.

## Where they are implemented

- **The server** (`packages/server`): the researcher API in
  `src/researcher/` (one file per path), the client API in `src/coder.ts`,
  with the runtime in `src/runtime/` doing the work.
- **The client** (`packages/client`) calls the researcher API
  (`api/httpAdminClient.ts`) and the client API (`api/httpJobServer.ts`).

## Authentication

| API | How |
|---|---|
| researcher API | Job users with a role per job: `READ`, `WRITE` or `ADMIN`. Real login is not built yet: the server trusts `x-dev-role` / `x-dev-email` headers (dev only). CORS is allowed, so a client on another origin can call it. |
| client API | A session cookie the server sets (httpOnly, same origin as the client), created from an invite secret. No CORS. [client.md#sessions-and-headers](client.md#sessions-and-headers) |

## Deployment ids

A deployed job runs as a **deployment**, identified by the job id, e.g.
`/d/42/session`. A researcher preview runs as `<jobId>.preview`.

## Machine-readable spec

```sh
pnpm --filter @annotinder/contracts generate:json-schema
```

writes `packages/contracts/dist/json-schema/{researcher,client}-api.json`:
per endpoint the method, path, and a JSON Schema for the request and
response body, for clients not written in TypeScript (R, Python).
