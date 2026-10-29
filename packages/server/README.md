# @annotinder/server

The annotinder server: one Hono app on one database.

- the **researcher API** (`/job/...`): jobs, codebooks, units, unitsets,
  invitations, publishing, progress. Used by the client's researcher UI, and
  by scripts (R, Python) and other systems (AmCAT). Spec:
  [docs/api/researcher.md](../../docs/api/researcher.md).
- the **coder API** (`/d/<deploymentId>/...`): what coders' browsers call.
  Spec: [docs/api/coder.md](../../docs/api/coder.md).

How it works: [docs/architecture.md](../../docs/architecture.md).

```sh
pnpm dev:server   # from the repo root: http://localhost:8787, seeded with a demo job
pnpm reset-db     # recreate and reseed the local database
```

Settings are environment variables: [`docs/hosting.md`](../../docs/hosting.md)
lists them. For development: without `DATABASE_URL` the server uses PGlite
(Postgres compiled to WebAssembly, in process) in `PGLITE_DIR` (default
`.pglite` in this package), so no Postgres install is needed; `pnpm reset-db`
only resets PGlite. `pnpm dev` ([`src/dev.ts`](src/dev.ts)) also sets
`ANNOTINDER_DEV_AUTH=1` (development auth headers for the researcher UI)
and `ANNOTINDER_DEMO=1` (a demo job in an empty database). With login
settings (`OIDC_*`) in development, plain http issuers work on localhost
only.

## API keys

Scripts authenticate with personal API keys. Logged-in researchers make
them in the researcher UI (account menu, "API keys"). On a server without
login, keys are made on the server's machine, with the same database
settings as the server (stop the server first when it runs on PGlite: only
one process can open it):

```sh
pnpm --filter @annotinder/server keys create --email a@uni.nl --label "R scripts" --role researcher
pnpm --filter @annotinder/server keys list --email a@uni.nl
pnpm --filter @annotinder/server keys revoke --email a@uni.nl --id 3
```

The key is printed once. `--role` sets the user's account role: only a
researcher can create jobs (and becomes their ADMIN), and an admin also
the server's settings. With it, they give others a role in a job
(`PUT /job/:id/users`), and make or revoke their own keys (`/me/keys`).

## Code

- [`src/app.ts`](src/app.ts): the app; [`src/index.ts`](src/index.ts): the
  Node entry point.
- [`src/researcher/`](src/researcher/): the researcher API, one file per
  path. Researcher auth is **dev only** ([`auth.ts`](src/researcher/auth.ts):
  plain `x-dev-role` / `x-dev-email` headers).
- [`src/coder.ts`](src/coder.ts): the coder API.
- [`src/runtime/`](src/runtime/): runs deployed jobs in memory: unit
  distribution, validation, sessions, previews. It reads and writes the
  database through [`store.ts`](src/runtime/store.ts).
- [`src/shared/`](src/shared/): database queries used by both.
- [`migrations/`](migrations/): the data model, as numbered SQL files,
  applied in order at startup ([`src/db.ts`](src/db.ts)). A change is a new
  file, never an edit to an applied one.

Tests run on PGlite (one instance per test file, emptied before each
test). To run them against a Postgres server instead, point
`TEST_DATABASE_URL` at a scratch database: each test worker gets its own
schema there, and its tables are emptied.
