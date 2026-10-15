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
- `packages/mock-server` -- the dev server (Hono + `node:sqlite`, requires
  Node >= 22): the researcher API for the client's admin side plus the backend
  API, so `pnpm dev` has a working db server. Not a template for a real one.
- `packages/reference-db-server` -- the backend API and nothing else, in
  memory, for one job loaded from a fixture (~230 lines). Read it as the
  specification of what a db server does for the job server.
- `packages/conformance` -- a test suite for the backend API, runnable
  against any db server URL (`DB_SERVER_URL=... pnpm conformance`), plus the
  fixture a db server loads for it. Both servers above pass it.
- `packages/job-server` -- the annotinder runtime coders talk to (Hono). Runs
  on Node (`src/index.ts`) or as a Cloudflare Worker with a Durable Object
  per deployment (`src/worker.ts`, `wrangler.toml`). Distributes units over
  coders, validates annotations and sends them to a db server in batches
  (a durable outbox). See `docs/architecture.md`.

## Development

```bash
pnpm install
pnpm dev          # runs the client, mock db server (:8787) and job server (:8788)
```

Open the client on http://localhost:5173. Coders' requests (`/d/...`) are
proxied by Vite to the job server: the coder session is a same-origin
httpOnly cookie, so the client and job server must share an origin.

The dev shell's "Annotate" view codes the seeded demo job through the job
server (deployment `mock.1`). If you have a mock-server database from before
the job server existed, run `pnpm reset-mock` once so the demo job is deployed.

To check a db server you are building (in any language): load
`packages/conformance/fixture.json` freshly as a job (the suite uses up its
single-use invites), then run
`DB_SERVER_URL=http://host DB_SERVER_SECRET=... DB_SERVER_JOB_ID=1 pnpm conformance`.
`pnpm dev:reference` serves the reference db server with that fixture on :8790.

Other useful root scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
(each runs across all packages).
