# Compositions: one set of parts, several products

Status: decided (2026-10-26). The server and client are built; local coding
from R and Python, and the R and Python packages, are not.

Annotinder has two parts:

- **server** (`packages/server`): one Node program. The researcher API
  (jobs, codebooks, units, unitsets, invites, deployments, results) and the
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

As the old annotinder did it: R (or Python) starts a tiny server, and the
browser does the work. This is how annotinder runs locally; there is no
separate local app (see "Not planned" below).

**R's part: storage only, three endpoints**, on a random local port:

- `GET /job`: codebook, units and unitsets, from R objects;
- `GET /annotations`: what has been coded so far;
- `POST /annotations`: answers, written back into R (a data frame, a file).

R needs only `httpuv` and `jsonlite`; Python only its standard library. No
Node, no binaries.

**The browser runs the job**, with the server's own runtime:

```
UI (JobRunner, JobManager)          unchanged: talks to the CoderApi interface
  ▼
LocalCoderApi                       new: calls the runtime directly, no HTTP
  ▼
DeploymentRuntime                   the server's code, running in the browser
  ▼
RStore                              new: a Store over R's three endpoints
```

- `LocalCoderApi` does what `server/src/coder.ts` does, minus HTTP and
  cookies: each `CoderApi` method calls the matching runtime method.
- `RStore` implements `Store` (`server/src/runtime/store.ts`): the spec and
  units from `GET /job` (kept in memory), annotations from
  `GET /annotations` once (finished units computed in memory: one coder),
  writes as `POST /annotations` (coder-level answers as rows without a
  unit). There is one coder.
- Needed first: the runtime moves out of `packages/server` into a package
  that runs in Node and the browser.
- No PGlite (R holds the data); QuickJS stays (the client runs conditions
  and scripts with it, as always).

**Where the client comes from:**

- served by R from the package (`http://localhost:8403`): same origin, no
  CORS or browser permission prompts; the package ships the built client
  (a few MB: check against CRAN's size limit). Preferred.
- or from annotinder.com (`https://annotinder.com/r/8403`): always the
  latest client, but an https page calling `http://localhost` meets
  browsers' local-network protections (Chrome asks for permission; CORS
  headers needed).

Either way the link carries a random token (`#<token>`) that R checks, so
other web pages can't write to the port.

**Limits:** one coder per R session: each browser runs its own runtime, so
there is no shared queue across coders (dynamic sources only make sense for
one coder). Teams use a server (self-hosted or annotinder.com).


## Not planned

- **A standalone local app** ("annotinder local": the server on PGlite with
  the client, as `npx` or single binaries per platform). Local coding from
  R and Python covers the local use cases without anything to install; a
  team coding together uses a server (self-hosted or annotinder.com). Don't
  build this unless a real case needs a team on a LAN without a server.

## Order of work (proposal)

1. Move the runtime into a package that runs in Node and the browser.
2. The client's local mode: `LocalCoderApi` and `RStore`, against a small
   test host.
3. The R package: researcher API client, and the local host (three
   endpoints, serving the client).
4. The Python module, the same.
