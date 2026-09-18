# Annotinder

Monorepo for the Annotinder client rewrite. See `annotinder-client_design_plan.txt`
for the full design plan.

## Packages

- `packages/contracts` -- the API contract (zod schemas), shared by the client
  and any server implementation. No React/Node-specific dependencies.
- `packages/client` -- the React + Vite client. Builds two ways:
  - `pnpm --filter @annotinder/client build:app` -- a standalone SPA, used for
    local development against the mock server.
  - `pnpm --filter @annotinder/client build:lib` -- an importable component/hook
    library (`@annotinder/client`), for embedding in a host app's own React tree.
- `packages/mock-server` -- a small reference server (Hono + `node:sqlite`,
  requires Node >= 22) implementing the contract, for local dev and as example
  documentation of how a real backend should behave.
- `old/` -- the previous NextJS fullstack implementation, kept temporarily as a
  porting reference. Will be deleted once migration is complete.

## Development

```bash
pnpm install
pnpm dev          # runs the client dev server + mock server in parallel
```

Other useful root scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
(each runs across all packages).
