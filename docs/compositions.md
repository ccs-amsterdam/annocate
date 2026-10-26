# Compositions: one set of parts, several products

Status: direction agreed (2026-10-16, updated 2026-10-26). The parts are
built; the products beyond the server and client (annotinder local, the R
and Python packages) are not.

Annotinder has two parts:

- **server** (`packages/server`): one Node program. The researcher API
  (jobs, codebooks, units, unitsets, invites, deployments, results) and the
  coder API for coders (`/d/<jobId>`): distribution, validation, sessions.
  It owns the data, in Postgres: a Postgres server (`DATABASE_URL`), or
  PGlite (Postgres compiled to WebAssembly, in process) for tests,
  development and annotinder local.
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
stay in-house.

**annotinder local**: everything on one machine, in one process.

- the server (on PGlite) and the built client, on one origin
- for: a researcher annotating locally in a nice interface, with their data
  in files; developing a codebook from R or Python with a live preview; a
  team on a LAN coding together (when the network allows it)

**Researcher API clients**: anything that talks to the researcher API, the
same way whichever server it is:

- R package
- Python module
- AmCAT (copies units into annotinder, so annotinder can run without it)
- the web client (its admin side)
- annotinder local's own UI (later, nice to have: push a job from local to
  another server)

## Annotinder local

### Composition

One Node program, `annotinder-local`:

- the **server**, as is: researcher API, coder API and storage (PGlite in
  the project folder). Needs: a way in for the local researcher without a
  login provider (e.g. an API key the CLI makes and writes to the project
  folder, for R and Python and the browser) and file import and export. No
  special "local mode" to maintain: exactly the production code paths.
- the **built client**, served from the same origin.
- a small CLI: `annotinder-local [project folder]`, which starts it and
  prints (or opens) the URL.

The coding interface is the browser; no Electron. Electron would add a
window and native file dialogs, but not easier network sharing: listening
on the network is one option in plain Node, and the hard part of LAN sharing
is the network itself (firewalls, client isolation on eduroam).

### Data: files people can copy

Leaning (not decided): **the database as the store, a project folder as the
interface.**

- The project folder holds the database and the files people care about:
  the codebook (`codebook.json`), units imported from a CSV or a directory
  (one file per unit), and annotations written out as coders work (e.g.
  `annotations.jsonl`: append-only, survives crashes, diffs well; and/or a
  CSV export).
- Why not files only: concurrent coders, partial writes and the
  distribution queries are what a database is for. A PGlite database is
  also just a folder you can copy.
- Formats (CSV, JSONL, xlsx, parquet, ...) are still open.

### Distribution

1. `npx annotinder-local` for people with Node 22+.
2. Single binaries per platform (no Node needed): Node's single executable
   applications, or Bun's compiled binaries (PGlite's WebAssembly and data
   files must be bundled as assets). Built in CI for Linux, macOS and
   Windows; published as GitHub releases.
   - R: `annotinder::install()` downloads the binary on first use (as
     quarto and tinytex do; CRAN doesn't allow shipping binaries).
   - Python: platform wheels with the binary inside (as ruff does).
   - macOS and Windows warn about unsigned binaries; signing and
     notarization are ongoing work (an Apple developer account).
3. Later, maybe: a desktop wrapper, only if a window and file dialogs turn
   out to matter for non-technical users.

### From R and Python

R and Python are researcher API clients, nothing more: the same package
works against annotinder local and a hosted server. Codebook development:
R pushes the codebook and opens the preview URL in the RStudio Viewer; the
preview picks up the new codebook on the next request (already built:
deployment `<jobId>.preview`).

**The researcher API is the public contract** (`docs/api/researcher.md`):
schemas in `packages/contracts`, API keys for scripts, a paged annotation
download, and tests that use it the way a script does.

### Later: exposing a local job to the internet (a bridge)

Other coders connect to one researcher's annotinder local, which handles
everything. Nothing else sees units or answers (highly secure coding), so
the connection must be **end-to-end encrypted**:

- Annotinder local dials out to a bridge (an outbound tunnel), so it works
  behind NAT and university firewalls; we only provide a public endpoint.
- TLS must end on the researcher's machine, not at the bridge. A Cloudflare
  tunnel does *not* do that (Cloudflare decrypts at its edge); a plain HTTPS
  reverse proxy on a VPS doesn't either.
- The bridge only forwards encrypted bytes, routed by hostname (SNI; TLS
  passthrough, e.g. a small TCP relay, or tools like frp/rathole), under a
  name like `<id>.<bridge domain>`.
- So annotinder local needs a certificate for that name, with the private
  key never leaving the machine: e.g. ACME (Let's Encrypt) DNS-01, with the
  bridge setting the challenge record for that one subdomain on request.
  Certificate rate limits per domain need checking (or a wildcard scheme).
- The researcher's machine must stay online while others code, and all
  traffic goes through the bridge (bandwidth is ours to pay).
- The bridge's hostnames should live under a domain separate from
  annotinder.com, so a malicious user can't get the main domain on
  phishing blocklists; and the bridge needs abuse limits (who may register
  an endpoint, bandwidth caps).

## Order of work (proposal)

1. `annotinder-local`: the composition, the project folder, file import and
   export, the CLI; `npx` first.
2. R package (and Python module) on the researcher API.
3. Single binaries and their distribution through R and Python.
4. Later: the bridge; pushing local jobs to another server.
