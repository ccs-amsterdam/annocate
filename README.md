# Annotinder

Monorepo for Annotinder: an annotation and survey tool for researchers. Design
docs live in `docs/`:

- `docs/api/`: **the APIs**: the researcher API (researcher UI, R, Python,
  other systems), the coder API (coders) and the admin API (server
  admins), a section per endpoint.
- `docs/architecture.md`: the server, unit distribution, resuming and
  codebook updates.
- `docs/compositions.md`: the products (annotinder.com, self-hosted,
  local coding from R and Python).
- `docs/coder-identity.md`: identity, sessions, invitations and login
  (coders and researchers), deleting a coder's data, response times.
- `docs/accounts.md`: account roles, becoming a researcher, limits, admins.
- `docs/client.md`: client design decisions (layout, question types and
  answers, references and conditions, admin UI).
- `docs/hosting.md`: running AnnoTinder (Docker Compose, settings, login
  provider, backups).
- `docs/plans/`: plans for features that are not built.
- `packages/contracts/CONTRACTS.md`: the contracts package (schemas, design
  notes).

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

Open the client on http://localhost:5173. Vite proxies the server's paths
(`/d`, `/job`, `/me`, `/auth`, `/admin`, `/examples`) to it: sessions are same-origin httpOnly
cookies, so the client and the server share an origin. Without login
settings, `pnpm dev` uses development auth headers for the researcher UI;
with them (`OIDC_*`, `ANNOTINDER_PUBLIC_URL=http://localhost:5173`, see
`packages/server/README.md`) it shows a login screen.

In development, an empty database gets a demo job, and the "Annotate" view
codes it (deployment `1`). If you have a database from before, run
`pnpm reset-db` once.

Other useful root scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
(each runs across all packages).

## Hosting

`docker compose up -d --build` runs AnnoTinder with Postgres, from
`.env` (copy `.env.example`). See [`docs/hosting.md`](docs/hosting.md).
