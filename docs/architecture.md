# Annotinder server architecture: db server + job server

Status: draft v1 (2026-10-10). First implementation in `packages/job-server`
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
- decides which unit a coder gets next (per-coder order or a shared crowd
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
   `GET /deployment` + `GET /annotations`. The one exception is crowd
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
directions currently use a shared bearer secret (see §8).

## 5. Lifecycle

**Deploy.** A researcher calls `PUT /job/:jobId/deployment` on the db server
with `{ codebookId, distribution, active }`. The db server:

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
   with the coder key and invite secret, then caches the resulting `coderId`.
2. **`GET /session`.** Served from the cache: the codebook plus per-unitset
   progress.
3. **`GET /unitset/:name/next`.** The job server picks a unit and, in crowd
   mode, leases it. It then serves the unit content from its cache. On a
   cache miss it fetches the unit plus the next few prefetch candidates from
   the db server in one request. If the db server no longer has the unit, it
   is dropped from the queue and the next one is tried.
4. **`POST /variables/unit`.** The job server checks that the unit was
   assigned to this coder, validates the variables, and writes them through
   to the db server. Only then does it update the queue.

**Researcher status.** `GET /job/:jobId/deployment/status` on the db server
proxies `GET /admin/deployments/:id/status`: units complete / started /
leased, codings, coders.

## 6. Distribution rules

These are configured per unitset in the deployment (`DistributionRuleSchema`).

**`per_coder`** (default). Every coder codes every unit of the unitset, in
unitset order, or in a deterministic per-coder shuffle if the `unit_loop` has
`randomizeUnits`. An optional `maxUnitsPerCoder` caps it.

**`crowd`.** Units come from a shared queue.

- A unit is **complete** when:
  - at least `codersPerUnit` coders finished it, **and**
  - if `agreement` is set, `minAgree` of them gave the same answer for
    `agreement.variable`.

  It is also complete, regardless of agreement, once `agreement.maxCoders`
  coders finished it.
- Each unit has **open slots**: the number of codings still needed, capped
  by `maxCoders`, minus active leases. That prevents over-assignment while
  coders are working.
- **Leases** last `leaseSeconds`. An expired lease frees its slot. Asking
  for "next" while holding a lease resumes the same unit (reload-safe).
- **`strategy`:**
  - `fill` prefers units closest to completion, so finished units arrive
    quickly;
  - `spread` prefers the least-coded units, for even coverage first.
- **`maxUnitsPerCoder`** caps each coder.

The example "1000 units, until 5 coders agree, max 100 per coder" becomes:

```json
{ "mode": "crowd", "agreement": { "variable": "sentiment", "minAgree": 5, "maxCoders": 10 }, "maxUnitsPerCoder": 100 }
```

## 7. Code map

| Where | What |
| --- | --- |
| `contracts/src/deployment.ts` | Distribution rules, deployment schemas, `backendEndpoints`, `jobServerAdminEndpoints`, status |
| `job-server/src/app.ts` | Hono app: coder API under `/d/:deploymentId`, admin API |
| `job-server/src/registry.ts` | Lazily loads one runtime per deployment; failures aren't cached |
| `job-server/src/runtime.ts` | `DeploymentRuntime`: spec, caches, write-through, status |
| `job-server/src/distribution.ts` | `UnitsetQueue`: pure per-coder / crowd assignment logic |
| `job-server/src/codebook.ts` | Loop/variable lookup, annotation validation, agreement keys |
| `job-server/src/backend.ts` | Typed backend API client; validates db server responses |
| `mock-server/src/routes/backend.ts` | Reference backend API implementation |
| `mock-server/src/routes/deployment.ts` | Researcher deployment endpoints, job server notification |

`job-server/src/__tests__/integration.test.ts` runs the real mock server and
job server against each other, through in-process `fetch`.

## 8. Open questions and next steps

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
6. **Distribution config location.** Rules currently live in the deployment
   (per unitset), while `randomizeUnits` lives on the codebook's `unit_loop`.
   Decide whether distribution belongs in the codebook too. It is immutable
   and reproducible, which argues for it. The deployment allows changing
   caps mid-job, which argues against.
7. **Scale.** `GET /backend/.../annotations` is a full dump on cold start.
   Add `?after=<cursor>` pagination. Per-unit state is O(units) in memory,
   which is fine into the 100k range per deployment.
8. **Deactivation semantics.** `active: false` stops new units (409), but
   coders can still submit units they were already working on. Decide
   whether that's what researchers expect.
