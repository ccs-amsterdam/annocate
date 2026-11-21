# The APIs

The server (`packages/server`) serves three APIs, all under `/api`: the paths
in these documents are relative to it (`GET /study` is
`https://annotinder.example.org/api/study`). Everything outside `/api` is the
web app.

| API | Called by | For | Contracts | Spec |
|---|---|---|---|---|
| **researcher API** (`/study/...`, `/me`, `/auth/...`) | the researcher UI (`ResearcherApi`), scripts (R, Python), other systems (AmCAT) | studies, designs, units, links, deploying, results | `researcherEndpoints` | [researcher.md](researcher.md) |
| **coder API** (`/d/<deploymentId>/...`) | the coding screen (`HttpCoderApi`, `StudyManager`) | the session, next units, saving answers | `coderEndpoints` | [coder.md](coder.md) |
| **admin API** (`/admin/...`) | the server admin page (`ServerApi`) | roles, registration, plans and limits, blocking, suspending studies | `adminEndpoints` | [admin.md](admin.md) |

The registries are in `packages/contracts/src/endpoints/`: one file per API,
each entry `{ method, path, request, response }` with zod schemas. Server side:
the researcher and admin APIs in `src/researcher/` (one file per path), the
coder API in `src/coder.ts` with the runtime in `src/runtime/`. Client side:
`api/httpResearcherApi.ts`, `api/httpCoderApi.ts`, `api/serverApi.ts`.

## Authentication

| API | How |
|---|---|
| researcher and admin API | The session cookie from logging in (same origin, with `x-annotinder: 1`), or a personal API key (`authorization: Bearer <key>`, also cross-origin: CORS is allowed). Development servers (`AUTH_DEV_MODE=1`, localhost only) also accept `x-dev-role` / `x-dev-email`. See [researcher.md](researcher.md). |
| coder API | A device cookie the server sets (httpOnly, same origin), a session started from a link secret. No CORS. See [coder.md](coder.md#sessions-and-headers). |

## Deployment ids

A deployed study runs as a deployment identified by the study id
(`/d/42/session`); a researcher preview as `<studyId>.preview`.

## Machine-readable spec

```sh
pnpm --filter @annotinder/contracts generate:json-schema
```

writes `packages/contracts/dist/json-schema/{researcher,coder}-api.json`: per
endpoint the method, path and JSON Schemas for request and response, for
clients not written in TypeScript.
