# Annotinder

Monorepo for Annotinder: an annotation and survey tool for researchers. Design
docs live in `docs/`:

- `docs/api/`: **the APIs**: the researcher API (researcher UI, R, Python,
  other systems) and the coder API (coders), a section per endpoint.
- `docs/architecture.md`: the server, unit distribution, resuming and
  codebook updates.
- `docs/compositions.md`: the products (annotinder.com, self-hosted,
  annotinder local, R/Python clients).
- `docs/encryption.md`: (on hold) encrypting participants' answers in the
  browser.
- `docs/coder-identity.md`: coder sessions, invitations, (planned) login.
- `docs/client.md`: client design decisions (layout, spans, scripting, admin UI).
- `packages/contracts/CONTRACTS.md`: the contracts package (schemas, design
  notes, auth advice).

## Packages

- `packages/contracts` -- the API contract (zod schemas), shared by the client
  and the server. No React/Node-specific dependencies.
- `packages/client` -- the React + Vite client. Builds two ways:
  - `pnpm --filter @annotinder/client build:app` -- a standalone SPA, used for
    local development against the server.
  - `pnpm --filter @annotinder/client build:lib` -- an importable component/hook
    library (`@annotinder/client`), for embedding in a host app's own React tree.
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
(`/d`, `/job`, `/me`, `/auth`) to it: sessions are same-origin httpOnly
cookies, so the client and the server share an origin. Without login
settings, `pnpm dev` uses development auth headers for the researcher UI;
with them (`OIDC_*`, `ANNOTINDER_PUBLIC_URL=http://localhost:5173`, see
`packages/server/README.md`) it shows a login screen.

The dev shell's "Annotate" view codes the seeded demo job (deployment `1`).
If you have a database from before, run `pnpm reset-db` once.

Other useful root scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
(each runs across all packages).
