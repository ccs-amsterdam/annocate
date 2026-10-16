# Compositions: one set of parts, several products

Status: direction agreed 2026-10-16 (discussion summary). Nothing here is
built yet beyond the parts themselves.

Annotinder has three parts, each usable on its own:

- **db server**: the source of truth. Researcher API (jobs, codebooks,
  units, unitsets, invites, deployments, results) and backend API (for job
  servers). Any language; conformance-tested (`packages/conformance`).
- **job server**: the annotinder runtime coders talk to: distribution,
  validation, caching, the outbox. TypeScript only (`packages/job-server`).
  Talks to db servers over the backend API, with job tokens (plan §13).
- **client**: the web app, for coders and researchers (`packages/client`).
  Always served from the job server's origin (session cookies).

The products below are compositions of these parts, not separate code. New
code goes into the parts; a product is configuration and packaging.

## The products

**annotinder.com**: hosted by us.

- annotinder db server (hosted by us)
- annotinder job servers: an allowlist with only our db server; EU-hosted,
  GDPR-proof, securely tied to the db server
- annotinder web client

**open.annotinder.com**: for anyone who runs their own db server.

- a self-hosted db server (AmCAT, a university's own, ...)
- our public job servers: open mode (`ANNOTINDER_DB_SERVERS=open`), Cloudflare,
  best effort; the coder UI shows which db server hosts a job
- the annotinder web client

**annotinder local**: everything on one machine.

- db server, job server and client in one process, on one origin
- for: a researcher annotating locally in a nice interface, with their data
  in files; developing a codebook from R or Python with a live preview; a
  team on a LAN coding together (when the network allows it)

**Researcher API clients**: anything that talks to a db server's researcher
API, the same way whichever db server it is:

- R package
- Python module
- the web client (its admin side)
- annotinder local's own UI (later, nice to have: push a job from local to
  another db server)

## Annotinder local

### Composition

One Node program, `annotinder-local`:

- the **SQLite db server**: today's mock server, promoted. It already has
  the researcher API, the backend API and SQLite storage. Needs: real
  researcher authentication (a local admin token, written to the project
  folder), file import and export, and a better name.
- the **job server**, imported as is. It reaches the db server through an
  in-memory `fetch` (as the job server's integration tests already do): no
  network between them, and exactly the production code paths, including
  the job token handshake (which costs nothing in-process). No special
  "local mode" to maintain.
- the **built client**, served from the same origin.
- a small CLI: `annotinder-local [project folder]`, which starts it and
  prints (or opens) the URL.

The coding interface is the browser; no Electron. Electron would add a
window and native file dialogs, but not easier network sharing: listening
on the network is one option in plain Node, and the hard part of LAN sharing
is the network itself (firewalls, client isolation on eduroam).

### Data: files people can copy

Leaning (not decided): **SQLite as the store, a project folder as the
interface.**

- The project folder holds `annotinder.sqlite` and the files people care
  about: the codebook (`codebook.json`), units imported from a CSV or a
  directory (one file per unit), and annotations written out as coders
  work (e.g. `annotations.jsonl`: append-only, survives crashes, diffs well;
  and/or a CSV export).
- Why not files only: concurrent coders, partial writes and the
  distribution queries (`/finished`) are what a database is for. The SQLite
  file itself is also a single copyable file.
- Formats (CSV, JSONL, xlsx, parquet, ...) are still open.

### Distribution

1. `npx annotinder-local` for people with Node 22+.
2. Single binaries per platform (no Node needed): Node's single executable
   applications (keeps `node:sqlite`), or Bun's compiled binaries (would
   need a small SQLite adapter: `bun:sqlite` has nearly the same API as
   `node:sqlite`, so one db server can run on either). Built in CI for
   Linux, macOS and Windows; published as GitHub releases.
   - R: `annotinder::install()` downloads the binary on first use (as
     quarto and tinytex do; CRAN doesn't allow shipping binaries).
   - Python: platform wheels with the binary inside (as ruff does).
   - macOS and Windows warn about unsigned binaries; signing and
     notarization are ongoing work (an Apple developer account).
3. Later, maybe: a desktop wrapper, only if a window and file dialogs turn
   out to matter for non-technical users.

### From R and Python

R and Python are researcher API clients, nothing more: the same package
works against annotinder local and a hosted db server. Codebook development:
R pushes the codebook and opens the preview URL in the RStudio Viewer; the
preview picks up the new codebook on the next request (already built:
`<db host>/<jobId>.preview`).

**Consequence: the researcher API becomes a public contract.** Today it is
"what the mock server implements". Before the R and Python packages, it
needs what the backend API has: a versioned schema in `packages/contracts`,
an authentication scheme for scripts (API keys for hosted db servers, the
local admin token for annotinder local), and a conformance suite.

### Later: exposing a local job to the internet

Instead of LAN sharing, the local app could act as a **db server for our
public job servers**, reachable through an outbound tunnel (a relay we host,
or e.g. a Cloudflare tunnel). Coders use open.annotinder.com as usual; only
the job server's backend calls travel to the laptop, in batches, and the
outbox buffers them while the laptop sleeps or is offline (up to its
limits). Open questions: who runs the relay, what it may see (TLS end to
end or not), abuse limits.

## Order of work (proposal)

1. Researcher API as a public contract: schemas in contracts, script
   authentication, conformance suite.
2. Promote the mock server to the SQLite db server: researcher auth, file
   import/export, a name; keep it the dev server too.
3. `annotinder-local`: the composition, the project folder, the CLI;
   `npx` first.
4. R package (and Python module) on the researcher API.
5. Single binaries and their distribution through R and Python.
6. Later: the tunnel to public job servers; pushing local jobs to another
   db server.
