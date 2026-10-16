# @annotinder/contracts

The shared, framework-agnostic API contract between an annotinder-client
frontend and any compliant server backend. This package contains only zod
schemas, their inferred TypeScript types, and small pure helper functions
(position parsing, codebook nesting validation) — no server or client
runtime code, no HTTP client, no React.

Any server backend (the dev server in `packages/mock-server`, or a real
backend written in any language) is expected to implement the endpoints
listed below and validate against these schemas. For the backend API, the
smallest complete implementation is `packages/reference-db-server`, and
`packages/conformance` checks a db server against it over HTTP: load
`ConformanceFixtureSchema` data (`packages/conformance/fixture.json`) as a
job, then run `DB_SERVER_URL=... pnpm conformance`.

## Design notes

- **No OpenAPI/`zod-to-openapi`.** The old codebase used
  `extendZodWithOpenApi`/`zod-to-openapi` pervasively to generate an OpenAPI
  document. This package deliberately skips that in favor of plain
  `.describe()` calls on schema fields, to keep the dependency footprint
  small. Non-TS server authors are instead served via
  `pnpm generate:json-schema`, which walks the endpoint registry and emits a
  plain JSON Schema document per endpoint (see below) — enough to validate
  request/response shapes without needing an OpenAPI toolchain.
- **Codebook as a tree.** A codebook is one JSON document: a list of
  top-level items, where `unit_loop` and `condition` items nest their
  `children`. `src/codebook/validation.ts` enforces the nesting rules:
  - `user_variable` / `unit_loop` items may not be nested inside a
    `unit_loop`.
  - `unit_variable` items must be nested inside a `unit_loop` (through any
    number of `condition` ancestors).
  - `unit_loop` items may not be nested inside another `unit_loop`.
  - `condition` items may appear (and be nested) anywhere.
  - `question`/`user_variable`/`unit_variable` items are always leaves.
  - Item names must be unique within a codebook.
  - `unit_loop` branches may only refer to coder-level variables defined
    before the loop (see `src/codebook/unitLoop.ts`).

  These rules are exposed both as a standalone function
  (`validateCodebookItems`, for reuse by a codebook editor UI) and wired into
  `CodebookItemsSchema` via `.superRefine` so they're enforced whenever a
  codebook document is parsed.
- **`VariableValue` is intentionally loose for now.** A coder's answer for a
  single variable (`src/variableValue.ts`) is a single object with optional
  `codes`/`spans`/`relations` arrays rather than a schema-per-variable-type
  discriminated union. This is a pragmatic v1 choice, to be tightened once
  Phase 3 (porting `JobManager`) reveals concrete needs.
- **`proof` field reserved, not enforced.** `VariableValueSchema.proof` is a
  placeholder for the future HMAC-signed answer-validation scheme (design
  plan §4). It is not generated or checked by anything yet.

## JSON Schema generation

```sh
pnpm --filter @annotinder/contracts generate:json-schema
```

Writes `dist/json-schema/endpoints.json` (the researcher-facing API, from
`src/endpoints/index.ts`) and `dist/json-schema/backend-endpoints.json` (the
API a db server exposes to the job server, from `src/deployment.ts`): for
every endpoint, the HTTP method, path, and a JSON Schema for both the request
and response body. This output is not checked into git
(see `.gitignore`); regenerate it whenever the contract changes.

## Endpoints

All paths are implicitly scoped under a job; a server may run one job per
deployment or route jobs by id — clients should not assume which (design
plan §3).

| Method | Path | Request | Response | Notes |
| --- | --- | --- | --- | --- |
| POST | `/job` | `JobWriteSchema` | `JobResponseSchema` | |
| GET | `/job/:id` | – | `JobResponseSchema` | |
| PUT | `/job/:id` | `JobWriteSchema` | `JobResponseSchema` | |
| DELETE | `/job/:id` | – | – | |
| GET | `/job/:id/users` | – | `JobUserSchema[]` | Requires ADMIN role |
| PUT | `/job/:id/users` | `JobUsersWriteSchema` | – | Whole-resource replace; requires ADMIN role |
| GET | `/codebook` | – | `CodebookMetaSchema[]` | |
| GET | `/codebook/:id` | – | `CodebookResponseSchema` | |
| POST | `/codebook` | `CodebookWriteSchema` | `CodebookResponseSchema` | |
| PUT | `/codebook/:id` | `CodebookWriteSchema` | `CodebookResponseSchema` | Rejected once `immutable` |
| DELETE | `/codebook/:id` | – | – | Rejected once `immutable` |
| GET | `/units` | – | `UnitMetaSchema[]` | Lightweight sync/hash check |
| GET | `/units/:id` | – | `UnitResponseSchema` | |
| POST | `/units` | `UnitsCreateBodySchema` | `UnitResponseSchema[]` | Bulk create, max 200 per call |
| DELETE | `/units/:id` | – | – | Rejected once `immutable` |
| GET | `/unitsets` | – | `UnitsetResponseSchema[]` | |
| POST | `/unitsets` | `UnitsetWriteSchema` | `UnitsetResponseSchema` | |
| PUT | `/unitsets/:id` | `UnitsetWriteSchema` | `UnitsetResponseSchema` | |
| DELETE | `/unitsets/:id` | – | – | Rejected while a codebook's unit_loop refers to it |
| POST | `/unitsets/generate` | `GenerateUnitsetsSchema` | `UnitsetResponseSchema[]` | Split units into `<prefix>_1..n` (+ `<prefix>_overlap`) |
| GET | `/coders` | – | `CoderProgressSchema[]` | Manager-facing progress listing; requires ADMIN/WRITE role |
| POST | `/coders/invite` | `CoderInviteWriteSchema` | `CoderInviteResponseSchema` | Requires ADMIN/WRITE role; `variables` presets the codebook's `auto` variables with `source: "invite"` |
| GET | `/deployment` | – | `DeploymentResponseSchema \| null` | |
| PUT | `/deployment` | `DeploymentWriteSchema` | `DeploymentResponseSchema` | Requires ADMIN; bumps `version`, freezes the codebook, notifies the job server |
| GET | `/deployment/status` | – | `DeploymentStatusSchema` | Proxied from the job server |
| POST | `/deployment/refresh` | `RefreshDeploymentSchema` | `{ version }` | Requires ADMIN; the job server re-checks the deployment now. `units: "all" \| ids` also drops its unit content cache (units aren't re-fetched otherwise) |
| POST | `/deployment/preview` | – | `PreviewSessionSchema` | Requires WRITE; a preview of the latest codebook on the job server (`<backend>.<jobId>.preview`), in memory only. The token (HMAC with the job server secret, format in the schema) is used as the invite secret |
| POST | `/annotations/reset` | `ResetAnnotationsSchema` | `{ retired }` | Requires ADMIN; retires live values (kept for analysis), so the units are coded again |

### Coder API (served by the job server)

Coders never talk to the db server; these are served by `packages/job-server`
under `/d/<deploymentId>` (see `docs/architecture.md`). They are part of this
registry because the client is written against them.

| Method | Path | Request | Response | Notes |
| --- | --- | --- | --- | --- |
| GET | `/session` | – | `SessionResponseSchema` | Coder-authenticated; returns codebook, per-loop progress and the coder's variables (incl. assigned `auto` variables) |
| GET | `/loop/:loop/next` | – | `CoderUnitResponseSchema \| null` | Coder-authenticated; the job server picks the unit per the loop's branches/sources; `null` means the coder is done with the loop |
| GET | `/loop/:loop/units/:unitId` | – | `CoderUnitResponseSchema` | Coder-authenticated; a unit the coder already has answers for (or holds), with their answers, e.g. to go back after resuming |
| POST | `/variables/unit` | `PostUnitVariablesSchema` | – | Coder-authenticated; full replace of one unit's variables |
| POST | `/variables/coder` | `PostCoderVariablesSchema` | – | Coder-authenticated; full replace of job-level variables |
| POST | `/transfer` | – | `TransferResponseSchema` | Coder-authenticated; one-time token to continue the session on another device |
| POST | `/transfer/redeem` | `RedeemTransferSchema` | `RedeemTransferResponseSchema` | No session needed; sets this device's session cookie (once per token) |

The session is an httpOnly cookie set by the job server (same origin as the
client). Coder headers: `x-annotinder: 1` (always; CSRF), `x-invite-secret`
and `x-participant-id` from the URL (create the coder on first use, and
select this link's session cookie), `x-new-session: 1` (first request only:
start another session for a participant that already has one). Errors are
`{ error, code? }`, with `code` from `CoderErrorCodeSchema`. See
`docs/coder-identity.md`.

### Backend API (db server, called by the job server)

`backendEndpoints` in `src/deployment.ts`. No shared secret (plan §13):
the job server gets a **job token** per job from `POST .../token` (a request
it signs with its Ed25519 key, verified against its published
`/.well-known/jwks.json`), and sends it on every other call as
`authorization: Bearer <token>`. A db server must store which job server
each job is bound to, and refuse tokens for any other: `401 { code:
"invalid_job_token" }`, after which the job server gets a new token and
retries once. Calls the other way (`jobServerAdminEndpoints`: refresh,
status, drop) are signed with the job's call key in the
`x-annotinder-signature` header; see `JOB_SERVER_SIGNATURE_HEADER`.
`reference-db-server/src/jobTokens.ts` implements all of the db server's
side.

| Method | Path | Request | Response | Notes |
| --- | --- | --- | --- | --- |
| POST | `/backend/job/:jobId/token` | `JobTokenRequestSchema` | `JobTokenResponseSchema` | **No shared secret**: the body is a JWT the job server signed with its Ed25519 key. Check that the job is bound to its `iss` (store which job server each job runs on), `aud`, `jobId` and the time window, then verify with `<iss>/.well-known/jwks.json`. Returns a job token (HS256 with the db server's secret, claims `jobId`, `aud`, `exp`, `ck`). Reference implementation: `reference-db-server/src/jobTokens.ts`. 404 if the job doesn't exist or has no job server; any other failure is 401 |
| GET | `/backend/job/:jobId/deployment` | – | `DeploymentSpecSchema` | 404 if not deployed. `?preview=1`: the latest codebook, deployed or not, `active`, with a `version` that changes with its content (researcher previews) |
| GET | `/backend/job/:jobId/units?ids=1,2` | – | `BackendUnitSchema[]` | Missing ids are simply left out. `hash`: content hash, changes whenever `data` does |
| GET | `/backend/job/:jobId/coders` | – | `BackendCoderSchema[]` | Variables + loop assignments of all coders (no emails). Only for researcher status, on demand; the job server loads coders one by one via `resolve` |
| POST | `/backend/job/:jobId/coders/resolve` | `ResolveCoderRequestSchema` | `BackendCoderSchema` | Creates the coder from an invite (copying its preset `variables`); 401 for an unknown coder without a valid invite |
| PUT | `/backend/job/:jobId/coders/:coderId` | `BackendCoderWriteSchema` | – | Full replace of `variables` + `assignments` |
| POST | `/backend/job/:jobId/finished` | `FinishedRequestSchema` | `BackendFinishedSchema[]` | The bulk query. Per group of variables, the rows where every variable has a live value (the db server only filters), plus the values of `values` variables. `level: "unit"` (default): per (unit, coder), e.g. a loop's finished units. `level: "coder"`: per coder over coder-level values, `unitId: null`, e.g. `balanced` counts. Coder-level values may be stored on the coder record or as annotation rows with a null unit |
| GET | `/backend/job/:jobId/annotations?coderId=X` | – | `BackendAnnotationSchema[]` | One coder's live values per unit, ordered by first write |
| POST | `/backend/job/:jobId/annotations` | `BackendAnnotationBatchSchema` | `BackendAnnotationBatchResultSchema` | The job server's buffered writes (about once a minute), applied **in order**; each upserts a live value per given variable, others are left alone. Writes for unknown units/coders are skipped and listed in `rejected`; the call fails only if nothing could be stored. Retrying is harmless. `unitHash`: the hash of the content the coder was shown; store it, never refuse for it |

## Auth

Not modeled as types/schemas in this package -- job users (ADMIN/WRITE/READ)
and coders are distinct identity types, and a server backend is expected to
authenticate/authorize both, but every backend is free to choose its own
mechanism (session cookies, OAuth/SSO in front of it, bearer tokens, ...).
This contract only assumes that layer exists; it never sees credentials.

`packages/mock-server` is a local-dev/testing reference implementation, not
a production template -- it intentionally uses a trivial, undocumented-as-
secure scheme (`x-dev-role`/`x-dev-email` plaintext headers for job users,
a client-generated `x-coder-key` bearer string + one-time `x-invite-secret`
for coders; see `mock-server/src/auth.ts`'s own doc comment). Real server
implementations should NOT copy this as-is. Recommended production scheme
for authors who want a stateless, horizontally-scalable session mechanism
rather than DB-backed sessions (coder sessions: see `docs/coder-identity.md`):

- **Job users**: front the admin API with whatever identity provider the
  deployment already has (SSO/OAuth/institutional login are typical for
  research-tool deployments); once a user is authenticated, issue an
  opaque bearer token that is an HMAC-signed claim of `{ jobId, email,
  role, issuedAt }` (e.g. `base64url(payload) + "." +
  base64url(HMAC-SHA256(serverSecret, payload))`). Verification is then a
  pure signature+expiry check with no DB round trip; role/email changes
  made via `PUT /job/:id/users` only take effect for tokens issued AFTER
  the change (short expiries, e.g. 1-24h, keep this window small -- don't
  design for instant revocation of already-issued tokens unless you also
  maintain a revocation list).
- **Coders**: an invite link's `secret` is consumed exactly once to mint a
  coder identity; from then on the coder should hold an HMAC-signed
  bearer token of `{ jobId, coderId, issuedAt }` (long-lived, since coders
  may return to a job over weeks) rather than a raw client-generated
  string trusted forever by DB lookup. This avoids ever storing a
  long-lived secret server-side (only the server's HMAC key, shared
  across all sessions, needs protecting) and makes token verification a
  pure function, independent of DB availability/latency.
- Either way, the token stays fully opaque to `packages/client` -- it's
  just a string passed through as a header/cookie by whatever
  `JobServer`/`AdminClient` implementation a given deployment configures;
  no client-side code needs to know it's HMAC-signed, versioned, or
  anything else about its internal structure.
