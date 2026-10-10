# Annotinder server architecture: db server + job server

Status: draft v2 (2026-10-10; v2 moves distribution into the codebook and
adds routing and invitations). First implementation in `packages/job-server`
and `packages/mock-server`. Supersedes design plan §3a (unit delivery and
resumable progress) and the "heavy client, thin server" approach in §0.

## 1. Why

The original plan kept servers thin by putting all logic in the client, so
servers could be written in Python, R and Node. That breaks down for:

- **Unit distribution across coders** (crowd coding: "code each unit until 5
  coders agree, at most 100 units per coder"). This needs a live, shared queue
  that no single client can own.
- **Validating annotations.** You can't trust the client, but re-implementing
  codebook validation (and eventually QuickJS conditions) in every server
  language is not realistic.
- **Speed.** Coders should get units fast, with caching close to them.

So the server side is split into two roles, with one shared contract
between them.

## 2. Roles

```
            researcher                          coder
                │                                  │
                ▼                                  ▼
 ┌──────────────────────────┐      ┌───────────────────────────────┐
 │ db server (any language) │◄────►│ job server (TypeScript)       │
 │  source of truth         │      │  annotinder runtime           │
 │  jobs, codebooks, units, │      │  distribution, leases         │
 │  coders, annotations     │      │  validation                   │
 │  export/analysis         │      │  unit + annotation cache      │
 └──────────────────────────┘      └───────────────────────────────┘
   researcher API                     coder API (/d/<deployment>/...)
   + backend API (/backend/...)       + admin API (/admin/...)
```

**db server.** It owns all data and is the source of truth. It can be written
in any language. It implements:

- the **researcher API** (`endpoints` in contracts), used by the client's
  admin side: jobs, codebooks, units, unitsets, invites, deployments;
- the **backend API** (`backendEndpoints` in contracts), used only by the job
  server. This is plain CRUD: deployment spec, unit content, coder
  resolution, annotation dump and write-through.

It never runs codebook logic. It validates only the shape of annotations
(JSON Schema is generated from the contracts) and referential integrity.

**job server.** This is the annotinder runtime. There is a single TypeScript
implementation, and the same code is meant to run on Node and on Cloudflare.
Coders talk only to the job server. It:

- resolves coders (via the db server) and serves the session and codebook;
- decides which unit a coder gets next, following the codebook's unit loops (fixed sets or a shared
  queue with leases, stopping rules and caps);
- validates annotations against the codebook;
- writes them through to the db server;
- caches unit content and the coder's own annotations.

**client.** No change in principle. The admin side talks to the db server.
The coder side (`HttpJobServer`, `JobManager`) talks to the job server at
`<job server>/d/<deploymentId>`, using exactly the coder endpoints it used
before.

## 3. Invariants

These are what make the job server safe to run anywhere, including an edge
worker:

1. **Write-through, never write-behind.** An annotation counts only once the
   db server has accepted it. The coder's request fails if the db server
   does.
2. **Rebuildable.** Everything the job server holds is a cache of the
   backend API. `DeploymentRuntime.load()` rebuilds it from
   `GET /deployment` + `GET /coders` + `GET /annotations`. The one exception is dynamic-source
   **leases**, which are deliberately disposable: losing them only returns an
   abandoned unit to the queue early. So the job server needs no database
   and no backups.
3. **Bounded retention.** Unit content is cached with a TTL. Dropping a
   deployment (`DELETE /admin/deployments/:id`) forgets everything held for
   it. That keeps GDPR retention simple: the job server is a processor with a
   short, documented retention window.

## 4. Trust and hosting

The job server sees units and annotations in plaintext. It must be trusted
for confidentiality, not only integrity. That is the price of putting
validation, real-valued stopping rules and caching in one place.

The mitigation is choice of deployment target, not cryptography:

- **Public edge** (Cloudflare Workers + Durable Objects). Fastest, and fine
  for non-sensitive material such as most crowd-coding jobs.
- **Self-hosted Node** (e.g. an EU university server next to the db server).
  For sensitive data. Coders of sensitive projects are usually near that
  server anyway, so losing the edge costs little.

A db server is configured with the job server it deploys to. A job server is
configured with the db servers (backends) it accepts deployments from. Both
directions currently use a shared bearer secret (see §10).

## 5. Lifecycle

**Deploy.** A researcher calls `PUT /job/:jobId/deployment` on the db server
with `{ codebookId, active }`. The db server:

- bumps the deployment `version`;
- freezes the codebook;
- calls `POST /admin/deployments/<backend>.<jobId>/refresh` on the job
  server. This is best effort.

The job server also re-checks the spec version at most every `specTtlMs`
(60s), so a missed notification heals itself.

**Deployment id.** The id is `<backend name>.<jobId>`, e.g. `mock.1`. The
backend name is how the job server's config refers to that db server. Invite
links point at the job server: `<job server>/d/<deploymentId>` + invite
secret.

**Coder session.**

1. **First request.** The job server calls `POST /backend/.../coders/resolve`
   with the coder key and invite secret. The db server creates the coder if
   needed, copying the invite's preset variables. The job server then
   assigns any missing server-side `auto` variables (§7) and caches the
   coder.
2. **`GET /session`.** Served from the cache: the codebook, per-loop
   progress, and the coder's variables (so client-side conditions can use
   assigned variables).
3. **`GET /loop/:loop/next`.** On the first call for a loop, the job server
   routes the coder to a branch (§6) and stores that. It then picks a unit
   and, for a dynamic source, leases it. It then serves the unit content from its cache. On a
   cache miss it fetches the unit plus the next few prefetch candidates from
   the db server in one request. If the db server no longer has the unit, it
   is dropped from the queue and the next one is tried.
4. **`POST /variables/unit`.** The job server checks that the unit was
   assigned to this coder, validates the variables, and writes them through
   to the db server. Only then does it update the queue.

**Researcher status.** `GET /job/:jobId/deployment/status` on the db server
proxies `GET /admin/deployments/:id/status`: units complete / started /
leased, codings, coders.

## 6. Distribution: the codebook describes the process

**Principle.** The codebook can name parameters, but never bind them. The
codebook is meant to be shared and reproduced. So it describes *how* units
are distributed, but it never contains unit ids or who the coders are.
There are three layers:

| Layer | Contains | Shared/reproducible? |
| --- | --- | --- |
| Codebook | questions, conditions, `unit_loop` distribution; refers to unitsets by name and to coders only via coder-level variables | yes |
| Unitsets | name -> ordered list of unit ids (e.g. `part_1`..`part_5`, `part_overlap`) | data, not process |
| Invitations | links with access rules and preset values for codebook variables | no (private to the db server) |

### 6.1 Unit loops

Defined in `contracts/src/codebook/unitLoop.ts`:

```yaml
type: unit_loop
name: main
order: random            # sequential (default) | random: per-coder shuffle, sources interleaved
maxUnits: 100            # per coder, across all sources of the branch
units:                   # first matching branch wins; no match = no units
  - when: { group: treatment }             # coder variable codes; [a, b] = any of; keys are ANDed
    sources:
      - { unitset: "part_{slot}" }         # fixed: coder gets every unit of their part
      - { unitset: part_overlap }          # fixed: everyone also gets the overlap units
  - sources:
      - unitset: pool
        dynamic: { maxCoders: 1 }          # one coder per unit, coders unknown in advance
      - unitset: reliability
        dynamic: { minCoders: 3, maxCoders: 5, agreement: { variable: sentiment, minAgree: 3 }, priority: saturate }
```

**Sources.** A unitset is just an ordered list of ids. Whether its units
are handed out *fixed* or *dynamic* is a property of the source, so the same
unitset can be used both ways.

- **Fixed.** The coder gets every unit of the set.
- **Dynamic.** A queue shared by all coders routed to it:
  - A unit is **complete** once `minCoders` (default 1) coders finished it
    and, with `agreement`, `minAgree` of them gave the same answer. It is
    also complete, regardless, once `maxCoders` coders finished it.
    `maxCoders` is required with an agreement rule, so a unit nobody agrees
    on isn't coded forever.
  - **Open slots** are codings still needed, capped by `maxCoders`, minus
    active leases. This prevents over-assignment while coders are working.
  - **Leases** last `leaseSeconds` (default 900). An expired lease frees the
    slot. A coder asking for "next" while holding a lease gets the same unit
    again, so a reload is safe.
  - **`priority`:**
    - `cover` (default) prefers least-coded units;
    - `saturate` prefers units closest to completion.

**`when`.** This is declarative (equality / any-of on coder-level variables)
rather than QuickJS. The job server evaluates it, any researcher can read
it, and it can be reproduced without a JS engine. Codebook validation checks
that `when` keys and `{placeholders}` refer to coder-level variables defined
*before* the loop, and that `when` values are among their codes.

**Routing is sticky.** The resolved unitset names are stored on the db
server per coder and loop (`assignments`, e.g. `{ main: ["part_2",
"part_overlap"] }`). A coder who later changes an answer used in `when`
keeps their units.

The example "1000 units, until 5 coders agree, max 100 per coder" is:

```yaml
order: random
maxUnits: 100
units:
  - sources: [ { unitset: __all__, dynamic: { maxCoders: 10, agreement: { variable: sentiment, minAgree: 5 } } } ]
```

### 6.2 Unitsets are explicit

Unitsets are stored lists, not recipes. That way adding units to a job never
changes an existing distribution. `POST /job/:jobId/unitsets/generate`
(and the "Split into parts…" UI) makes them easy to create:

- shuffle the units with a seed;
- set aside an overlap (`overlapUnits` or `overlapFraction`) as
  `<prefix>_overlap`;
- split the rest into `<prefix>_1..n`.

The splitting logic is a pure function, `splitUnits` in contracts.

## 7. Coder variables and invitations

**`auto` variables** are assigned, never asked, and never changed afterwards.
The client skips them as steps.

- `random`: weighted draw from `options` (job server).
- `balanced`: the option fewest coders have so far (job server). This
  spreads unknown coders evenly over `part_{slot}`.
- `invite`: the value preset on the coder's invitation. If the invitation
  doesn't set one, `fallback` (`random` | `balanced`) applies, or the value
  stays empty.
- `url_param`: read from the URL by the client. Not implemented in the
  client yet.

The job server refuses to let the client overwrite assigned variables.
`POST /variables/coder` keeps the stored values.

**Invitations** (db server only, never in the codebook):

```json
{ "label": "Alice", "access": "only_authenticated", "emails": ["alice@uni.nl"], "maxUses": 1, "variables": { "slot": "2" } }
```

- **Routing a specific coder.** A per-coder invite with
  `variables: { slot: "2" }` routes them to `part_2`, and the codebook never
  learns who they are.
- **General links.** A link with no preset relies on the variable's
  `fallback`.
- **Enforcement today.** `maxUses` is enforced. Email restrictions are
  stored, but they need real coder authentication before they can be
  enforced (§10).

## 8. Job updates (not implemented yet; designed for)

Researchers will want to update a deployed job without coders redoing
unchanged work. Choices made so far keep that possible:

- **Annotations are keyed by variable name.** A new codebook version that
  keeps a question's name and meaning keeps its answers. A future "what
  changed" diff between codebook versions can mark only changed or new
  variables as needing an answer, and the job server would then serve
  partially done units again.
- **Routing survives updates.** Assignments store *resolved unitset names*,
  not branch indices. On a new version, a coder keeps their routing as long
  as some branch still produces the same unitsets. Otherwise they are
  re-routed on their next request.
- **Completion is derived, not stored.** Dynamic-source completeness is
  computed from annotations. Raising `minCoders` or changing an agreement
  rule simply reopens units.
- **Unitsets are explicit.** Adding units means adding them to a unitset (or
  a new one) on purpose. Existing assignments don't shift.

Open: annotations are not tagged with the loop or codebook version they were
made under, and a unit is stored once per coder. A unit used in two loops
for the same coder shares one annotation. Tagging annotations with the
codebook version is probably the first step towards real update support.

## 9. Code map

| Where | What |
| --- | --- |
| `contracts/src/codebook/unitLoop.ts` | `unit_loop` branches, fixed/dynamic sources, `when`, placeholders, legacy migration |
| `contracts/src/unitset.ts` | Unitsets, `splitUnits` generator |
| `contracts/src/deployment.ts` | Deployment schemas, `backendEndpoints`, `jobServerAdminEndpoints`, status |
| `job-server/src/app.ts` | Hono app: coder API under `/d/:deploymentId`, admin API |
| `job-server/src/registry.ts` | Lazily loads one runtime per deployment; failures aren't cached |
| `job-server/src/runtime.ts` | `DeploymentRuntime`: spec, caches, routing, auto variables, write-through, status |
| `job-server/src/distribution.ts` | `UnitPool` (fixed/dynamic source), `pickNext` (per-loop picking), `Codings` |
| `job-server/src/codebook.ts` | Loop/variable lookup, annotation validation, agreement keys |
| `job-server/src/backend.ts` | Typed backend API client; validates db server responses |
| `mock-server/src/routes/backend.ts` | Reference backend API implementation |
| `mock-server/src/routes/deployment.ts` | Researcher deployment endpoints, job server notification |
| `client/.../admin/UnitLoopForm.tsx` | Editor for loop branches and sources |

`job-server/src/__tests__/integration.test.ts` runs the real mock server and
job server against each other, through in-process `fetch`.

## 10. Open questions and next steps

Roughly in order:

1. **Admin preview through the job server.** `JobPreview` still uses the mock
   server's legacy coder routes (`routes/session.ts`), so the db server still
   has to implement them. Plan: a preview deployment (`<backend>.<jobId>`
   with a draft codebook, never frozen, annotations not written through, or
   written to a scratch coder). Then the legacy routes can go.
2. **Cloudflare target.** A Worker entry that routes `/d/:id/*` and
   `/admin/deployments/:id/*` to a Durable Object per deployment, which holds
   one `DeploymentRuntime`. The runtime is already async and storage-free, so
   this is an adapter, not a port. Use a jurisdiction-restricted (EU) DO
   namespace where needed, and check the current Cloudflare terms first.
3. **Auth.** Replace the shared bearer secret with HMAC-signed requests (or
   short-lived tokens) in both directions. Coder auth is still the dev-mode
   `x-coder-key` + invite secret. Design plan §6.1's signed coder session
   tokens fit here: issued by the job server after `resolve`.
4. **Multimedia.** Images, audio and video in units should probably **not**
   flow through the JSON path. Proposal: units reference media by id; the job
   server returns short-lived signed URLs; the bytes come from a separate
   blob gateway. That could be R2 with signed URLs for the edge target, or
   the db server's own file endpoint for self-hosted. This keeps the job
   server's memory and cache JSON-only. The blob gateway follows the same
   trust choice as the job server it pairs with.
5. **Semantic validation.** The current validation checks variable names,
   codes, items and span/relation codes. Running codebook conditions
   (QuickJS) server-side, to reject answers to questions the coder should
   never have seen, is the natural next step. It belongs here, not in db
   servers.
6. **`url_param` auto variables** are documented as client-side but not
   implemented in `JobManager` yet. Email-restricted invites need real coder
   authentication (item 3).
7. **Scale.** `GET /backend/.../annotations` is a full dump on cold start.
   Add `?after=<cursor>` pagination. Per-unit state is O(units) in memory,
   which is fine into the 100k range per deployment. Status computation is
   O(coders x units) and should be cached or made incremental for large
   jobs.
8. **Deactivation semantics.** `active: false` stops new units (409), but
   coders can still submit units they were already working on. Decide
   whether that's what researchers expect.
9. **Job updates** (§8): codebook-version tagging of annotations and a
   variable-level diff between versions.
