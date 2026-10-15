# Annotinder

Monorepo for Annotinder: an annotation and survey tool for researchers. Design
docs live in `docs/`:

- `docs/architecture.md`: db server + job server split, unit distribution,
  resuming and codebook updates.
- `docs/coder-identity.md`: coder sessions, invitations, (planned) login.
- `docs/client.md`: client design decisions (layout, spans, scripting, admin UI).
- `packages/contracts/CONTRACTS.md`: the API contract.

## Packages

- `packages/contracts` -- the API contract (zod schemas), shared by the client
  and any server implementation. No React/Node-specific dependencies.
- `packages/client` -- the React + Vite client. Builds two ways:
  - `pnpm --filter @annotinder/client build:app` -- a standalone SPA, used for
    local development against the mock server.
  - `pnpm --filter @annotinder/client build:lib` -- an importable component/hook
    library (`@annotinder/client`), for embedding in a host app's own React tree.
- `packages/mock-server` -- a small reference db server (Hono + `node:sqlite`,
  requires Node >= 22) implementing the contract, for local dev and as example
  documentation of how a real backend should behave.
- `packages/job-server` -- the annotinder runtime coders talk to (Hono; runs on
  Node, designed to also run as a Cloudflare Worker). Distributes units over
  coders, validates annotations and writes them through to a db server. See
  `docs/architecture.md`.

## Development

```bash
pnpm install
pnpm dev          # runs the client, mock db server (:8787) and job server (:8788)
```

The dev shell's "Annotate" view codes the seeded demo job through the job
server (deployment `mock.1`). If you have a mock-server database from before
the job server existed, run `pnpm reset-mock` once so the demo job is deployed.

Other useful root scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
(each runs across all packages).
