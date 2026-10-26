# @annotinder/server

The annotinder server: one Hono app on one database.

- the **researcher API** (`/job/...`): jobs, codebooks, units, unitsets,
  invitations, publishing, progress. Used by the client's researcher UI, and
  by scripts (R, Python) and other systems (AmCAT). Spec:
  [docs/api/researcher.md](../../docs/api/researcher.md).
- the **client API** (`/d/<deploymentId>/...`): what coders' browsers call.
  Spec: [docs/api/client.md](../../docs/api/client.md).

How it works: [docs/architecture.md](../../docs/architecture.md).

```sh
pnpm dev:server   # from the repo root: http://localhost:8787, seeded with a demo job
pnpm reset-db     # recreate and reseed the local database
```

Environment: `PORT` (8787), `DB_PATH` (`annotinder.sqlite` in this
package), `ANNOTINDER_SECRET` (signs preview tokens; random per process if
not set, so previews end with a restart).

## Code

- [`src/app.ts`](src/app.ts): the app; [`src/index.ts`](src/index.ts): the
  Node entry point.
- [`src/researcher/`](src/researcher/): the researcher API, one file per
  path. Researcher auth is **dev only** ([`auth.ts`](src/researcher/auth.ts):
  plain `x-dev-role` / `x-dev-email` headers).
- [`src/coder.ts`](src/coder.ts): the client API.
- [`src/runtime/`](src/runtime/): runs deployed jobs in memory: unit
  distribution, validation, sessions, previews. It reads and writes the
  database through [`store.ts`](src/runtime/store.ts).
- [`src/shared/`](src/shared/): database queries used by both.
- [`schema.sql`](schema.sql): the data model. No migrations yet: the
  development database is recreated when this file changes
  ([`src/db.ts`](src/db.ts)).

Storage is SQLite (`node:sqlite`, Node >= 22) for now; Postgres is next.
