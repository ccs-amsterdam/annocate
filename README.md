# Annotinder

Monorepo for AnnoTinder: an annotation and survey tool for researchers.

## Documentation

Read in this order:

1. [`docs/architecture.md`](docs/architecture.md): the server, the design
   and how it distributes units, resuming, design updates, the database.
2. [`docs/hosting.md`](docs/hosting.md): running AnnoTinder (a pilot
   server step by step, settings, login provider, backups, capacity).
3. Accounts and security:
   [`docs/accounts.md`](docs/accounts.md) (account roles, becoming a
   researcher, limits, admins),
   [`docs/security.md`](docs/security.md) (login and the second factor,
   security headers, rate limits, exported data),
   [`docs/coder-identity.md`](docs/coder-identity.md) (coder sessions,
   links and login, deleting a coder's data, response times).
4. [`docs/api/`](docs/api/README.md): the researcher, coder and admin
   APIs, a section per endpoint.
5. [`docs/client.md`](docs/client.md): the client (coding runtime, layouts,
   question types, scripting, the researcher UI).

Also: [`docs/glossary.md`](docs/glossary.md) (terms),
[`docs/compositions.md`](docs/compositions.md) (hosted, self-hosted, local
coding from R and Python), [`docs/examples.md`](docs/examples.md) (recipes,
example studies, the setup wizard),
[`docs/release-checklist.md`](docs/release-checklist.md) (before a pilot or
release), [`docs/plans/`](docs/plans/README.md) (features not built yet),
[`packages/contracts/CONTRACTS.md`](packages/contracts/CONTRACTS.md) (the
contracts package). The help for researchers is in the app
(`packages/client/src/lib/help/topics`).

## Packages

- `packages/contracts` -- the API contract (zod schemas), shared by the client
  and the server. No React/Node-specific dependencies.
- `packages/client` -- the React + Vite client: the app the server serves
  (`pnpm --filter @annotinder/client build`, docs/hosting.md).
- `packages/server` -- the server (Hono + Postgres or PGlite, Node >= 22): the
  researcher API and the coder API on one database, and the runtime that
  distributes units over coders and validates their answers. See its
  README and `docs/architecture.md`.

## Development

```bash
pnpm install
pnpm dev          # runs the client (:5173) and the server (:8787)
```

Open the client on http://localhost:5173. Vite proxies `/api` to the
server: sessions are same-origin httpOnly
cookies, so the client and the server share an origin. Without login
settings, `pnpm dev` uses development auth headers for the researcher UI;
with them (`OIDC_*`, `ANNOTINDER_PUBLIC_URL=http://localhost:5173`, see
`packages/server/README.md`) it shows a login screen.

In development, an empty database gets a demo study, and the "Annotate" view
codes it (deployment `1`). `pnpm reset-db` starts over with an empty
database.

Other useful root scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
(each runs across all packages).

`pnpm test:e2e` runs the end-to-end tests (`packages/e2e`, Playwright): a
browser codes the example studies, the researcher makes and downloads studies,
against a server with a fresh database and the built client. Install a
browser once with `pnpm --filter @annotinder/e2e exec playwright install
chromium`, or point `PLAYWRIGHT_CHROMIUM_PATH` at an installed Chromium.

## Hosting

`docker compose up -d --build` runs AnnoTinder with Postgres and daily
database dumps, from `.env` (copy `.env.example`). `scripts/smoke-test.sh
<url>` checks a running server. [`docs/hosting.md`](docs/hosting.md) has a
step-by-step guide for a pilot server, and the settings.
