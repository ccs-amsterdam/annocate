# Compositions: one set of parts, several products

AnnoTinder has two parts:

- **server** (`packages/server`): one Node program with the researcher API
  and the coder API (distribution, validation, sessions). It owns the data,
  in Postgres (`DATABASE_URL`) or PGlite (development, tests).
- **client** (`packages/client`): the web app for coders and researchers,
  always served from the server's origin.

Other systems (AmCAT, R, Python) are **clients of the researcher API**: they
push units and designs and download answers. Products are compositions of
these parts, not separate code.

## The products

| Product | Status | What |
| --- | --- | --- |
| **annotinder.com** | planned | a public server run by us (`hosting.md`, "The public server"), researcher login through a self-hosted OpenID Connect provider. Where it is hosted is stated on the server's own information page (release plan, P-A3) |
| **Self-hosted** | built | the same server and client on a university's or project's own machines (`hosting.md`) |
| **Local coding from R and Python** | not built | R or Python hosts the data, the browser runs the study: developing a design with a live preview, or coding one's own data |
| **R package, Python module** | not built | a client of any server's researcher API (`docs/api/researcher.md`), plus the host for local coding |

## Local coding from R and Python (the plan)

R (or Python) hosts a study on the researcher's machine, with the data in R
objects, and coders use the normal client. It should behave exactly like a
server, including several coders on one network.

**Proposed: R runs the server's runtime.** R's `V8` package embeds a
JavaScript engine: R loads a bundle of the runtime with a memory store that
saves into R objects, and serves the coder API with `httpuv`. The client is
unchanged. Python: the same with `mini-racer` and its standard HTTP server.

**Tested (R 4.3.3, V8 4.4.1, Linux): feasible.** The contracts and
`distribution.ts` run unchanged from an es2020 bundle (~110 KB gzipped);
loading takes under 0.1 s; promises and WebAssembly work; validation is about
2x slower than in Node. What it needs:

- The runtime in its own package, free of Node and database imports, with a
  memory store (`PreviewStore` is most of one).
- Shims: R's V8 has no web APIs (`TextEncoder`, `crypto`, `btoa`, timers,
  `URL`); random bytes and SHA-256 via a callback into R or pure JS.
- Routing in R, calling coarse runtime functions with JSON text (~0.5 ms per
  call; JSON text, not R lists).

Not verified: CRAN's Windows and macOS builds, Python's `mini-racer`.

**Rejected:** PGlite in the browser (each coder would have their own
database); distribution rules rewritten in R; R starting Postgres or Node.

**Fallback** if V8 fails on a platform: the runtime in the browser over three
endpoints R serves (`GET /study`, `GET /annotations`, `POST /annotations`);
one coder at a time.

**Serving the client:** from the package at `http://localhost:8403` (same
origin, no CORS). The link carries a random token R checks, so other pages
can't write to the port.

## Not planned

**A standalone local app** (the server on PGlite as `npx` or a binary). Local
coding from R and Python covers single users; teams use a server. Only if a
real case needs a team on a LAN without a server.

## Order of work

1. Move the runtime into a package without Node or database imports, with a
   memory store.
2. The R package: researcher API client and local host.
3. The Python module.
