# Plan: a stateless server, and the same runtime everywhere

Status: proposed, not built (2026-10-28). Replaces `architecture.md` §3
(invariants 2–4: rebuildable cache, bounded memory, one process) once
built, and changes the local plan in `compositions.md`.

## 1. Why

The coder runtime (`server/src/runtime/runtime.ts`, `distribution.ts`) is
still built like the old job server, which had no database of its own and
had to fetch everything over the network. So it keeps nearly everything in
memory and treats Postgres as the place to rebuild from:

| In memory now | Used for |
| --- | --- |
| Deployment spec (codebook, loops, question types, unitsets) | Every request: validation, loops |
| Coder records (routing, ended, deletion request, session values, email) and a device-key map | Every request: who is asking, is the session closed, routing |
| Coder-level answers (`variables`) | Auto variables, only-changed writes, `/session`, end values |
| Workspaces: each active coder's unit answers | Going back to a unit, a coder's finished units |
| Unit content (LRU, 64 MB) and shown versions | Serving units |
| Transfer links | Continuing on another device |
| `balanced` counts, set routing for every coder | Assigning groups and sets |
| Shared queues: finished codings per unit, agreement keys, leases | Picking the next unit |

Costs of this:

- **One process only** (`architecture.md` §3.4). Two Node processes against
  one database would hand out the same queue slots twice, lose transfer
  links and leases, and balance groups wrongly.
- **Complexity that exists only for the cache**: rebuilding, eviction under
  memory budgets, `pendingCodings`, `codingsBasis`, `annotationEpoch`,
  `refresh` plumbing from researcher actions, memory statistics.
- **Little gain now**: Postgres runs next to the server, and most of these
  are one indexed query of well under a millisecond, made once per page
  load or once per unit.

What the old design did well, and this plan keeps in another way: few
requests per unit. It handed out units in batches and saved answers
optimistically (§5).

## 2. Goals

1. **Stateless server processes**: any number of them against one
   Postgres; Postgres is the only state. In memory only what can't go
   stale: the deployment spec per codebook version.
2. **One runtime, the same behaviour everywhere**: the server, local coding
   from R and Python (§7), and researcher previews run the same code, so no
   feature works differently anywhere and the UI and help need no
   exceptions.
3. **Few requests per unit** (batches, optimistic saving) and a bounded,
   predictable load on Postgres (§6).

## 3. Layers

```
HTTP (Hono app: cookies, headers, routes)       coder.ts, as now
  ▼
Runtime (pure TypeScript)                       codebook rules, validation,
  │                                             distribution rules
  ▼
Store (interface, narrow)                       reads and writes, leases,
  ├─ PgStore      server: Postgres, multi-process safe
  └─ MemoryStore  one process holds the data: previews, tests, local hosts (§7)
```

- **Runtime**: the rules, written once: what a loop is, validating answers,
  checking branch choices against unitset templates, a coder's unit order,
  end values, and the distribution rules (which unit next in a shared
  queue, which set or group). It holds no state between requests except
  the spec cache. It moves into its own package (`packages/runtime`) that
  runs in Node and other JavaScript hosts (§7).
- **Store**: the seam, as now, but narrower and without caching above it.
  For distribution it offers primitives (candidate units of a queue,
  leasing, counts per group or set) rather than whole tables, so the
  Postgres version can use indexes and locks and the memory version can
  use maps. The rules stay in the runtime, so both behave the same.
- Researcher previews already use a memory store (`runtime/preview.ts`);
  `MemoryStore` grows out of it.

## 4. Per request, on the server

- **Who is asking**: the device cookie gives the per-job key; one query
  (`coder_devices` → `coders`, joined with the deployment's `version` and
  `annotation_epoch`) gives the coder record and tells whether the spec
  cache is current. No separate spec check, no coder cache.
  - A signed cookie carrying the coder id was considered: it would save
    that lookup, but "session ended" and "data deleted" must hold at once,
    which needs the database anyway. Not now.
- **Spec cache**: per deployment and `version`, parsed once (loops,
  question types, shown fields). Immutable, so each process keeps its own.
  A researcher's change bumps the version or epoch and the next request
  sees it; the `refresh` calls from researcher routes go.
- **Coder-level answers**: read when needed (`/session`, end values).
  Written only when changed, in SQL (`ON CONFLICT … DO UPDATE … WHERE
  value IS DISTINCT FROM excluded.value`). Server-assigned values are
  protected by the codebook (`auto` questions are dropped from what the
  browser sends) and by `assigned` rows not being overwritten. Auto values
  are assigned when the coder row is created, in the same transaction.
- **Frozen answers** (built in step 1): a coder-level answer used in
  a unit loop (in a branch, unitset name, template or condition) is frozen
  once the coder has units in that loop: a `frozen` flag on the row, set on
  the first unit submit; the upsert skips frozen rows; the client shows
  the answer as no longer changeable.
- **Units**: read by id; the shown version (`unit_versions`, by hash)
  looked up or inserted on serve. No unit cache.
- **A coder's earlier unit answers** (going back): read from their rows.
- **Transfer links**: a `transfers` table (token hash, coder, participant,
  expires); used once.

## 5. Units in batches, answers saved optimistically

- `GET /loop/:loop/units?count=k` (replacing `next`): up to `k` units the
  coder hasn't finished, in their order. For a fixed list (all, sets,
  invitation, overlaps) that is just the next ones; for a shared queue, `k`
  units leased in one transaction (§6). Default `k` around 5, adjusted to
  unit size.
- **The client keeps a small queue** and fetches more when one or two are
  left, so a coder never waits for the next unit.
- **Saving**: the client shows the next unit right away and posts answers
  from a queue that retries until the server confirms. The server still
  stores before it confirms (invariant 1); the coder just doesn't wait for
  it. Unsent answers are kept in memory only (answers in `localStorage` would
  outlive the session on a shared computer); leaving the page with unsent
  answers asks first. The end of the job waits for the queue to empty.
- A submit for a unit whose lease expired is still accepted (as now: worst
  case one coding too many).

## 6. Distribution in Postgres

**Fixed lists** (all, sets, invitation, overlaps) need no shared state: a
coder's next units are their unitset minus what they finished, one
indexed query.

**Sets and balanced groups** are decided once per coder (routing is
sticky): a count query (coders per set, or per option), inside a
transaction holding an advisory lock for that loop or variable, so two
coders starting at the same moment are counted right. The 24-hour rule
for dropouts is a `WHERE` on the coders' last activity.

**Shared queues** get two tables:

- `queue_units` (deployment, loop key, unitset, unit, `finished` count,
  `agreed`, `full`): one row per unit of a queue, kept up to date on
  submit. Agreement is worked out for that one unit from its codings (a
  few rows) by the runtime's rule, and stored as `agreed`.
- `unit_leases` (unit, coder, loop key, expires).

A pick runs in one transaction with an advisory lock on the queue:

1. Postgres returns candidates by index: not finished or leased by this
   coder, not `full`, fewest `finished` first, a limited number (e.g. 50).
2. The runtime applies the queue's rules to them (open slots, the
   "Reach" tiers for coders below `minUnits`, agreement) and takes `k`.
3. Leases are inserted; expired ones are deleted on the way.

The lock serializes picks per queue only; with batches that is a few per
second at most for a large job.

**After a codebook change or a researcher reset** that changes what
"finished" means for a queue (its questions or agreement variables, or the
epoch), `queue_units` is rebuilt for that queue, once, at deploy time, not
in a coder's request.

## 7. Local coding from R and Python

Wanted: the same behaviour as a server, including several coders (e.g. a
team on one network coding into the researcher's R session), so no feature
needs a "not in R" note.

- **PGlite doesn't solve it.** It runs inside one browser, so each coder
  would have their own database; and the data lives in R, not in PGlite.
  Making one browser host the database for the others is the "one process
  holds the state" design again, with a browser as the server.
- **Distribution rules written in R**: duplicates the runtime. No.
- **R starts Postgres or Node**: an install most R users don't have.
- **Proposed: R runs the runtime itself.** R's `V8` package (on CRAN)
  embeds a JavaScript engine. R loads the runtime package's bundle into
  V8, with `MemoryStore` saving into R objects, and serves the coder API
  with `httpuv` (the same routes as the server). The client is unchanged:
  it talks HTTP to R as it would to a server. Several coders can join over
  the network; a single R process holds the state, which for one machine is
  exactly right. Python: the same with an embedded engine (`mini-racer`)
  and its standard HTTP server.

  **Spike (2026-10-28, R 4.3.3, V8 package 4.4.1 on engine 10.2, Linux):
  feasible.** The contracts (zod) and `distribution.ts` run unchanged from
  an es2020 bundle (~500 KB minified, ~110 KB gzipped; zod's locales can
  go); loading it takes under 0.1 s. Promises work (`await = TRUE`).
  WebAssembly works. Validating is about 2x slower than in Node. An httpuv
  round trip into V8 works. What it needs:
  - Shims: R's V8 has no web APIs (`TextEncoder`, `crypto`, `btoa`,
    timers, `URL`). `crypto.getRandomValues` and SHA-256 go through a
    synchronous callback into R (`openssl`), ~0.3 ms per call; or a
    pure-JS SHA-256.
  - The runtime must be free of Node and database imports (`node:crypto`
    in `shared/units.ts` and `preview.ts`, `db.ts`): step 6.
  - Routing in R (httpuv), calling coarse runtime functions with JSON
    strings: each R→JS call costs ~0.5 ms, and Hono needs `Request`,
    `URL` and friends.
  - Pass JSON text, not R lists (jsonlite's simplification breaks nested
    data).
  Not verified: CRAN's Windows and macOS builds (newer engines), Python's
  `mini-racer`. Found on the way: a shared-queue pick reshuffles the whole
  pool (~1 ms with 2000 units), worth fixing in step 4.
- **Fallback**, if that spike fails: the runtime in the browser with
  `MemoryStore` over R's three endpoints, as `compositions.md` describes
  now. All features then behave as on a server for one coder; only several
  coders at once is not possible.

## 8. Load on Postgres

For a large crowd job: 1000 coders at once, a unit every 20 s each, 5
questions per unit, batches of 5:

| Per second | |
| --- | --- |
| ~50 submits | one transaction each: ~5 answer rows, one `queue_units` row |
| ~10 batch picks | one locked transaction each |
| ~60 coder lookups | one indexed query each |

A modest Postgres does thousands of such transactions per second. What
matters: a connection pool per process (sized so all processes together
stay under Postgres's `max_connections`), indexes for every query above,
and no query that scans a whole job in a coder's request.

## 9. Steps

Each step its own commit, with tests passing and the system working.

1. **Coder-level answers out of memory** (done): read when needed, only
   changed ones written; `auto` values assigned when the session is loaded;
   frozen answers (`annotation_values.frozen`, set on a unit submit for the
   loop's `loopDependencies`; the coding screen shows them read-only).
2. **The rest of the per-coder state out of memory** (done): the coder
   record per request (routing merged in SQL, so two requests can't
   overwrite each other's), units and shown versions (`unit_serves` keeps
   the version), transfer links as a table, the spec re-read when the
   deployment's stamp changes (`deployments.revision`, bumped by researcher
   changes; the refresh endpoint and the unit cache are gone).
3. **Sets and balanced groups** (done): counted in the database under a
   lock per loop or variable.
4. **Shared queues** (done): finished codings as a table (`unit_codings`,
   written with the answers, derived again when the loops change:
   `deployments.codings_basis`), `unit_leases`, the pick under the queue's
   lock. Workspaces are gone: a coder's earlier answers are read per unit.
   Tests: two processes asked at the same moment hand out different units;
   a changed loop is derived again once, also with two processes. As built,
   a pick reads the loop's codings and leases (not a per-unit summary
   table): simpler, and enough for jobs of thousands of units; the summary
   is the next step if a queue gets very large.
5. **Batches and optimistic saving** (contracts, server, client).
6. **The runtime package**: runtime and `MemoryStore` out of
   `packages/server`, runnable outside Node.
7. **Docs**: `architecture.md` §3 and §10, `api/coder.md`, `compositions.md`.
8. **Local hosts** (later, separate): the V8 spike, then the R package.

Steps 1–4 are done; the server runs any number of processes against one
database (previews aside, §10).

## 10. Open points

- Batch size: fixed, or by unit size?
- Running several processes in the hosted setup (Docker Compose replicas
  behind the existing proxy).
- Previews keep their coders and answers in the memory of one process
  (`preview.ts`). With several processes a preview needs them in the
  database (marked as preview data, deleted when it expires), or requests
  of one preview routed to one process.
- The job's answer limit is counted per process between reads (once a
  minute): with several processes a job can pass it by a little.
