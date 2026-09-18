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

Not yet implemented in this package (deferred to a later phase, see design
plan §4). Job users (ADMIN/WRITE/READ) and coders are distinct identity
types; a server backend is expected to authenticate/authorize both and this
contract assumes that layer exists, but doesn't currently model tokens or
sessions beyond `SessionResponseSchema`'s data shape.
