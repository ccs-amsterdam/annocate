# Plan: the four APIs, named and documented

Status: done (2026-10-19). The result: [`docs/api/`](api/README.md).

## Problem

- It's hard to see what a db server must implement. The endpoint tables are
  in `packages/contracts/CONTRACTS.md`, mixed with design notes and auth
  advice; the reference db server is one 300-line file.
- The names don't say who talks to whom. The db server's API for the job
  server is called the "backend API" (`/backend/...`, `Backend*` schemas);
  the job server's API for db servers is its "admin API" (`/admin/...`),
  which sounds like a researcher thing. One registry, `endpoints`, mixes the
  researcher endpoints (db server) with the coder endpoints (job server).

## The four APIs

```
   client                          db server                 job server
 ┌──────────────┐  researcher API ┌───────────┐ annotator API ┌───────────┐
 │ researcher UI │ ─────────────► │           │ ◄──────────── │           │
 │ (AdminClient) │                │           │ ────────────► │           │
 │               │                └───────────┘    DB API     │           │
 │ annotator     │ ───────────────────────────────────────►  │           │
 │ (JobServer)   │                  client API                └───────────┘
 └──────────────┘
```

| API | Served by | Called by | Contracts | Paths |
|---|---|---|---|---|
| researcher API | db server | client researcher UI (`AdminClient`) | `researcherEndpoints` | `/job/...` |
| annotator API | db server | job server (`AnnotatorClient`) | `annotatorEndpoints` | `/annotator/job/:jobId/...` |
| client API | job server | client annotator (`HttpJobServer`) | `clientEndpoints` | `/d/<deploymentId>/...` |
| DB API | job server | db server (refresh, status, drop) | `dbEndpoints` | `/db/deployments/<deploymentId>/...`, `/.well-known/jwks.json` |

A db server implements the researcher API and the annotator API; a job
server implements the client API and the DB API.

## Steps

1. **Docs** (`docs/api/`):
   - `README.md`: the parts, the diagram, the table above, auth per link,
     and where each API is implemented.
   - `researcher.md`, `annotator.md`, `client.md`, `db.md`: an endpoint
     table at the top (each row links to its section), then a section per
     endpoint: schemas (linked to their source), behaviour, errors, and the
     implementations.
   - `architecture.md` §2 and §9, `CONTRACTS.md` (keeps design notes,
     JSON Schema, auth advice; the endpoint tables move to `docs/api`),
     root `README.md`, `compositions.md`: use the new names, link to
     `docs/api`.
2. **Contracts**: `src/endpoints/{researcher,annotator,client,db}.ts`;
   `Backend*` schemas become `Annotator*`; JSON Schema output per API.
3. **Paths and code**: `/backend/` → `/annotator/`, `/admin/deployments/`
   → `/db/deployments/`; job server `backend.ts` → `annotatorClient.ts`;
   mock server `routes/backend.ts` → `routes/annotator.ts`.
4. **Reference db server**: one file per annotator endpoint
   (`src/annotator/`), the in-memory store in `src/store.ts`, and a
   `README.md`: what a db server implements, a checklist of every endpoint
   of both APIs linking to its docs section and implementation (annotator:
   here; researcher: the mock server, the only implementation so far).

Paths change for db servers outside this repo too; there are none yet, and
the contracts are at 0.1.0.
