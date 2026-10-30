# Compositions: one set of parts, several products

Status: decided (2026-10-26). The server and client are built; local coding
from R and Python, and the R and Python packages, are not.

Annotinder has two parts:

- **server** (`packages/server`): one Node program. The researcher API
  (jobs, codebooks, units, sets, links, deployments, results) and the
  coder API for coders (`/d/<jobId>`): distribution, validation, sessions.
  It owns the data, in Postgres: a Postgres server (`DATABASE_URL`), or
  PGlite (Postgres compiled to WebAssembly, in process) for tests and
  development.
- **client** (`packages/client`): the web app, for coders and researchers.
  Always served from the server's origin (session cookies).

Other systems (AmCAT, R, Python) are **clients of the researcher API**: they
push units, a codebook and job settings, and download annotations (maybe
later: a webhook that posts batches of annotations).

The products below are compositions of these parts, not separate code. New
code goes into the parts; a product is configuration and packaging.

## The products

**annotinder.com**: hosted by us. The server on Postgres, EU-hosted, plus
the web client; researcher login through a self-hosted OpenID Connect
provider (probably Authentik).

**Self-hosted annotinder**: the same server and client, run by a university
or project on its own infrastructure (Node and Postgres). For data that must
stay in-house, and for teams.

**Local coding from R and Python** (below): R or Python hosts the data, the
browser runs the job. For developing a codebook with a live preview, and a
researcher coding their own data. One coder.

**R package and Python module**: both things in one package: a client of
the researcher API of any annotinder server (jobs, units, codebooks,
downloading annotations; the API is the public contract,
`docs/api/researcher.md`), and the host for local coding.

## Local coding from R and Python (the plan)

R (or Python) hosts a job on the researcher's machine, with the data in R
objects, and coders use the normal client. It should behave exactly like a
server, including several coders (a team on one network coding into the
researcher's R session), so no feature needs a "not in R" note.

**Proposed: R runs the server's runtime.** R's `V8` package (on CRAN)
embeds a JavaScript engine. R loads a bundle of the runtime with a memory
store that saves into R objects, and serves the coder API with `httpuv`
(the same routes as the server). The client is unchanged: it talks HTTP to
R as it would to a server. One R process holds the state, which for one
machine is exactly right. Python: the same with an embedded engine
(`mini-racer`) and its standard HTTP server.

**Spike (2026-10-28, R 4.3.3, V8 package 4.4.1 on engine 10.2, Linux):
feasible.** The contracts (zod) and `distribution.ts` run unchanged from an
es2020 bundle (~500 KB minified, ~110 KB gzipped; zod's locales can go);
loading takes under 0.1 s; promises (`await = TRUE`) and WebAssembly work;
validating is about 2x slower than in Node; an httpuv round trip into V8
works. What it needs:

- The runtime in its own package, free of Node and database imports
  (`node:crypto` in `shared/units.ts`, `shared/deployments.ts` and
  `preview.ts`; the database store `runtime/store.ts` and `db.ts` stay in
  the server), with a memory store (`preview.ts`'s `PreviewStore` is most
  of one).
- Shims: R's V8 has no web APIs (`TextEncoder`, `crypto`, `btoa`, timers,
  `URL`). Random bytes and SHA-256 through a synchronous callback into R
  (`openssl`), ~0.3 ms per call, or a pure-JS SHA-256.
- Routing in R (httpuv), calling coarse runtime functions with JSON text:
  each R→JS call costs ~0.5 ms, and Hono needs `Request`, `URL` and
  friends. Pass JSON text, not R lists (jsonlite's simplification breaks
  nested data).

Not verified: CRAN's Windows and macOS builds (newer engines), Python's
`mini-racer`.

**Rejected:** PGlite (it runs inside one browser, so every coder would have
their own database, and the data lives in R); distribution rules written in
R (a second copy of the runtime); R starting Postgres or Node (an install
most R users don't have).

**Fallback**, if V8 turns out not to work on some platform: the runtime in
the browser, over three endpoints R serves (`GET /job`, `GET /annotations`,
`POST /annotations`). Features then behave as on a server for one coder;
several coders at once are not possible.

**Where the client comes from:** served by R from the package
(`http://localhost:8403`: same origin, no CORS or browser permission
prompts; the package ships the built client, a few MB: check CRAN's size
limit). The link carries a random token that R checks, so other web pages
can't write to the port.

## Not planned

- **A standalone local app** ("annotinder local": the server on PGlite with
  the client, as `npx` or single binaries per platform). Local coding from
  R and Python covers the local use cases without anything to install; a
  team coding together uses a server (self-hosted or annotinder.com). Don't
  build this unless a real case needs a team on a LAN without a server.

## Order of work (proposal)

1. Move the runtime into a package without Node or database imports, with
   a memory store.
2. The R package: researcher API client, and the local host (the runtime
   in V8, the coder API over httpuv, serving the client).
3. The Python module, the same.
