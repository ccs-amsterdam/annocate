# AnnoTinder

AnnoTinder is a web tool for researchers who have people code texts and
answer questions: content analysis, surveys and experiments in one study.
A researcher writes a design (questions, units to code, how units are
divided over coders), deploys it, and sends coders a link; answers come back
with what each coder saw and how long they took.

This repository holds the server, the web client and the shared API contract.

## Getting started

You need Node 22 or newer and pnpm (`corepack enable` gives you the version in
`package.json`). No Postgres is needed for development: the server uses
PGlite (Postgres in WebAssembly) in `packages/server/.pglite`.

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173.

- `pnpm dev` starts the client (Vite, :5173) and the server (:8787). Vite
  forwards `/api` to the server, so both share one origin.
- The researcher UI is at `/research`. Without login settings you are logged
  in automatically (development auth, localhost only).
- An empty database gets a demo study. Code it at
  http://localhost:5173/code/demostudy001?link=demo-secret.
- `pnpm reset-db` starts over with an empty database.

To try a real login locally, set `OIDC_HOST`, `OIDC_CLIENT_ID`,
`OIDC_CLIENT_SECRET`, `OIDC_ACCOUNT_URL` and
`ANNOTINDER_PUBLIC_URL=http://localhost:5173` in your shell before `pnpm dev`
(see [docs/hosting.md](docs/hosting.md#settings)).

### Checks and tests

| Command | What |
| --- | --- |
| `pnpm test` | Unit tests of all packages (Vitest). One package: `pnpm --filter @annotinder/server test` |
| `pnpm test:e2e` | End-to-end tests (Playwright): a browser against a fresh server with the built client |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Across all packages |
| `pnpm format` / `pnpm format:check` | Prettier (Markdown is left alone) |

For the end-to-end tests, install a browser once with
`pnpm --filter @annotinder/e2e exec playwright install chromium`, or point
`PLAYWRIGHT_CHROMIUM_PATH` at an installed Chromium. Server tests run on
PGlite; `pnpm --filter @annotinder/server test:pg` runs them, and the tests
that need a real Postgres, against the scratch server in `TEST_DATABASE_URL`
([packages/server/README.md](packages/server/README.md#tests)).

### Running a server

```bash
git checkout v0.9.0       # a release
cp .env.example .env      # fill in the required settings (ANNOTINDER_VERSION=0.9.0)
docker compose pull app && docker compose up -d
scripts/smoke-test.sh https://annotinder.example.org
```

`compose.yml` runs the published image with Postgres and daily database
dumps, listening on `127.0.0.1:8787` for a reverse proxy that does HTTPS. The
guide (the login provider, settings, the proxy, updates, backups, monitoring,
the Cloudflare proxy, and capacity) is in [docs/hosting.md](docs/hosting.md).
Who runs a server, and where, is for each server to say: the software and
these docs make no statement about it.

## Packages

- `packages/contracts`: the API contract (zod schemas), shared by client and server.
- `packages/server`: the server (Hono, Postgres or PGlite): researcher, coder
  and admin APIs, and the runtime that hands out units. See its
  [README](packages/server/README.md).
- `packages/client`: the React + Vite app the server serves.
- `packages/e2e`: the Playwright tests.

## Documentation

- [docs/hosting.md](docs/hosting.md): running a server with Docker Compose: settings, login provider, updates, backups, monitoring, Cloudflare, capacity.
- [docs/plans/go-live.md](docs/plans/go-live.md): checklists for taking a server live.
- [docs/legal/](docs/legal/README.md): drafts of a privacy statement, terms of use and a data processing agreement outline (not reviewed by a lawyer).
- [docs/architecture.md](docs/architecture.md): how the server works: distribution, resuming, design updates, the database.
- [docs/client.md](docs/client.md): the client: coding runtime, templates, question types, the researcher UI.
- [docs/api/](docs/api/README.md): the researcher, coder and admin APIs.
- [docs/coder-identity.md](docs/coder-identity.md): coder sessions, links, login, deleting data, response times.
- [docs/accounts.md](docs/accounts.md): account roles, researchers, limits, admins.
- [docs/security.md](docs/security.md): login and second factor, headers, rate limits.
- [docs/glossary.md](docs/glossary.md): the terms used everywhere.
- [docs/examples.md](docs/examples.md): recipes and example studies.
- [docs/compositions.md](docs/compositions.md): hosted, self-hosted, and local coding from R and Python.
- [docs/release-checklist.md](docs/release-checklist.md): before a pilot or a release.
- [docs/philosophy.md](docs/philosophy.md): why AnnoTinder works the way it does.
- [docs/plans/](docs/plans/README.md): features not built yet.

Help for researchers is in the app (`packages/client/src/lib/help/topics`).
