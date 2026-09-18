# @annotinder/contracts

The shared, framework-agnostic API contract between an annotinder-client
frontend and any compliant server backend. This package contains only zod
schemas, their inferred TypeScript types, and small pure helper functions
(position parsing, codebook nesting validation) — no server or client
runtime code, no HTTP client, no React.

Any server backend (the reference mock server in `packages/mock-server`, or a
real backend written in any language) is expected to implement the endpoints
listed below and validate against these schemas.

## Design notes

- **No OpenAPI/`zod-to-openapi`.** The old codebase used
  `extendZodWithOpenApi`/`zod-to-openapi` pervasively to generate an OpenAPI
  document. This package deliberately skips that in favor of plain
  `.describe()` calls on schema fields, to keep the dependency footprint
  small. Non-TS server authors are instead served via
  `pnpm generate:json-schema`, which walks the endpoint registry and emits a
  plain JSON Schema document per endpoint (see below) — enough to validate
  request/response shapes without needing an OpenAPI toolchain.
- **Positional codebook model.** Unlike the old normalized DAG of
  `codebookNodes` rows (`parentId` + `treeType` enum), a codebook here is a
  flat array of items, each carrying a dotted-decimal `position` string (e.g.
  `"4.2.1"`) that implicitly encodes its place in the tree. See
  `src/codebook/position.ts` for the parsing helpers and
  `src/codebook/validation.ts` for the nesting rules this enables:
  - `user_variable` / `unit_loop` items may not be nested inside a
    `unit_loop`.
  - `unit_variable` items must be nested inside a `unit_loop` (through any
    number of `condition` ancestors).
  - `unit_loop` items may not be nested inside another `unit_loop`.
  - `condition` items may appear (and be nested) anywhere.
  - `user_variable`/`unit_variable` items are always leaves.
  - All positions and item names must be unique within a codebook.

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

Writes `dist/json-schema/endpoints.json`: for every entry in the endpoint
registry (`src/endpoints/index.ts`), the HTTP method, path, and a JSON Schema
for both the request and response body. This output is not checked into git
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
| DELETE | `/unitsets/:id` | – | – | |
| GET | `/session` | – | `SessionResponseSchema` | Coder-authenticated; returns codebook + per-unitset progress |
| GET | `/unitset/:setname/next` | – | `CoderUnitResponseSchema \| null` | Coder-authenticated; `null` means the unitset is exhausted |
| POST | `/variables/unit` | `PostUnitVariablesSchema` | – | Coder-authenticated; full replace of one unit's variables |
| POST | `/variables/coder` | `PostCoderVariablesSchema` | – | Coder-authenticated; full replace of job-level variables |
| GET | `/coders` | – | `CoderProgressSchema[]` | Manager-facing progress listing; requires ADMIN/WRITE role |
| POST | `/coders/invite` | `CoderInviteWriteSchema` | `CoderInviteResponseSchema` | Requires ADMIN/WRITE role |

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
(design plan §6.1) rather than DB-backed sessions:

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
