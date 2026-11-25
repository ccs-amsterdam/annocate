# @annotinder/server

The annotinder server: one Hono app on one database.

- the **researcher API** (`/study/...`): studies, design versions, units, sets,
  links, deploying, progress. Used by the client's researcher UI, and
  by scripts (R, Python) and other systems (AmCAT). Spec:
  [docs/api/researcher.md](../../docs/api/researcher.md).
- the **coder API** (`/d/<deploymentId>/...`): what coders' browsers call.
  Spec: [docs/api/coder.md](../../docs/api/coder.md).
- the **admin API** (`/admin/...`): server settings, users, plans. Spec:
  [docs/api/admin.md](../../docs/api/admin.md).
- login (`/api/auth/...`), the account (`/api/me`), `/api/health` and
  `/api/ready` (all APIs under `/api`), and the built client
  (`ANNOTINDER_CLIENT_DIR`, [docs/hosting.md](../../docs/hosting.md)).

How it works: [docs/architecture.md](../../docs/architecture.md).

```sh
pnpm dev:server   # from the repo root: http://localhost:8787, seeded with a demo study
pnpm reset-db     # recreate and reseed the local database
```

Settings are environment variables: [`docs/hosting.md`](../../docs/hosting.md)
lists them. For development: without `DATABASE_URL` the server uses PGlite
(Postgres compiled to WebAssembly, in process) in `PGLITE_DIR` (default
`.pglite` in this package), so no Postgres install is needed; `pnpm reset-db`
only resets PGlite. `pnpm dev` ([`src/dev.ts`](src/dev.ts)) also sets
`AUTH_DEV_MODE=1` (development auth headers for the researcher UI; localhost only)
and `ANNOTINDER_DEMO=1` (a demo study in an empty database). With login
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

The key is printed once. `--role` sets the **user's** account role (`user`,
`researcher` or `admin`), not the key's: only a researcher can create studies
(and becomes their ADMIN), and an admin also manages the server.

What the key itself can do ([docs/security.md](../../docs/security.md) §1):

- **A key acts as a researcher at most.** `keys create --role admin` makes
  the user an admin, and gives a key that works as a researcher's: the admin
  API (`/admin/...`) answers it 403 `admin_required`. The user does admin
  work in the web client, after logging in with a second factor.
- **A key never does sensitive actions** (403 `not_with_api_key`): making or
  revoking keys, deleting a study, an account or coders' data, resetting
  answers, exporting a study, changing who is a study's ADMIN. With a key a
  researcher can still give others the READ or WRITE role in a study
  (`PUT /study/:id/users`).

So on a server without login, more keys are made with this command, not with
a key.

## Code

- [`src/app.ts`](src/app.ts): the app; [`src/index.ts`](src/index.ts): the
  Node entry point; [`src/config.ts`](src/config.ts): the settings, read and
  checked at start.
- [`src/researcher/`](src/researcher/): the researcher API, one file per
  path. Researcher auth ([`auth.ts`](src/researcher/auth.ts)): the session
  cookie after login ([`login.ts`](src/researcher/login.ts),
  [`oidc.ts`](src/oidc.ts)), API keys, and on development servers
  `x-dev-*` headers.
- [`src/coder.ts`](src/coder.ts): the coder API.
- [`src/runtime/`](src/runtime/): runs deployed studies: unit distribution
  (state in `unit_codings` and `unit_leases`, under database locks),
  validation, sessions, previews (in memory). It reads and writes the
  database through [`store.ts`](src/runtime/store.ts).
- [`src/shared/`](src/shared/): database queries used by both.
- [`src/db/`](src/db/): the database, through [Drizzle](https://orm.drizzle.team):
  the tables per area in [`schema/`](src/db/schema/), opening a database and
  applying the migrations in [`index.ts`](src/db/index.ts), and SQL
  expressions used inside queries (role resolution, unit data) in
  [`sql.ts`](src/db/sql.ts). Queries use Drizzle's query builder; a few
  (distribution's locks, comparing draft and deployed units, bulk inserts)
  are `sql` templates.
- [`migrations/`](migrations/): made by Drizzle from the schema, applied in
  order when the server starts. `0001_seed.sql` is hand-written: what the
  schema can't say (`rate_limits` is unlogged) and the seed rows.

Changing the schema: edit [`src/db/schema/`](src/db/schema/), then

```sh
pnpm --filter @annotinder/server db:generate
```

writes a new migration in `migrations/` (with its snapshot in
`migrations/meta/`). Read it, and commit it with the schema change; an
applied migration is never edited. For something the schema can't say,
`pnpm --filter @annotinder/server exec drizzle-kit generate --custom --name <what>`
makes an empty migration to write by hand.

Tests run on PGlite (one instance per test file, emptied before each
test). To run them against a Postgres server instead, point
`TEST_DATABASE_URL` at a scratch server: each test worker gets its own
database there (`annotinder_test_<n>`), and its tables are emptied.
