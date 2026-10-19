# Annotinder

Monorepo for Annotinder: an annotation and survey tool for researchers. Design
docs live in `docs/`:

- `docs/api/`: **how the parts talk**: the four APIs (researcher, annotator,
  client, DB), with a page per API and a section per endpoint.
- `docs/architecture.md`: db server + job server split, unit distribution,
  resuming and codebook updates.
- `docs/compositions.md`: the products (annotinder.com, open.annotinder.com,
  annotinder local, R/Python clients) as compositions of db server, job
  server and client.
- `docs/encryption.md`: (possible hardening) encrypting participants'
  answers between client and db server, so job servers never see them.
- `docs/coder-identity.md`: coder sessions, invitations, (planned) login.
- `docs/client.md`: client design decisions (layout, spans, scripting, admin UI).
- `packages/contracts/CONTRACTS.md`: the contracts package (schemas, design
  notes, auth advice).

## Packages

- `packages/contracts` -- the API contract (zod schemas), shared by the client
  and any server implementation. No React/Node-specific dependencies.
- `packages/client` -- the React + Vite client. Builds two ways:
  - `pnpm --filter @annotinder/client build:app` -- a standalone SPA, used for
    local development against the mock server.
  - `pnpm --filter @annotinder/client build:lib` -- an importable component/hook
    library (`@annotinder/client`), for embedding in a host app's own React tree.
- `packages/mock-server` -- the dev server (Hono + `node:sqlite`, requires
  Node >= 22): the researcher API for the client's researcher UI plus the
  annotator API, so `pnpm dev` has a working db server. Not a template for a
  real one.
- `packages/reference-db-server` -- what a db server implements: its README
  lists every endpoint of both APIs, and it implements the annotator API
  (in memory, one file per endpoint) for one job loaded from a fixture.
- `packages/conformance` -- a test suite for the annotator API, runnable
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
server (deployment `localhost:8787/1`: the mock server's host and the job id). If you have a mock-server database from before
the job server existed, run `pnpm reset-mock` once so the demo job is deployed.

To check a db server you are building (in any language): load
`packages/conformance/fixture.json` freshly as a job (the suite uses up its
single-use invites), bound to the job server the suite plays (it serves
that job server's keys on `JOB_SERVER_PORT`, default 8791), then run
`DB_SERVER_URL=http://host DB_SERVER_JOB_ID=1 pnpm conformance`.
For example, with the reference db server:
`JOB_SERVER_URL=http://localhost:8791 pnpm dev:reference` (on :8790), then
`DB_SERVER_URL=http://localhost:8790 pnpm conformance`.

Other useful root scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
(each runs across all packages).
