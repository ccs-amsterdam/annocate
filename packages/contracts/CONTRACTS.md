# @annotinder/contracts

The shared, framework-agnostic API contract between an annotinder-client
frontend and any compliant server backend. This package contains only zod
schemas, their inferred TypeScript types, and small pure helper functions
(position parsing, codebook nesting validation) — no server or client
runtime code, no HTTP client, no React.

The server (`packages/server`) implements both APIs: the researcher API
(jobs, codebooks, units, publishing; used by the researcher UI, R, Python
and other systems) and the coder API (used by coders' browsers). Types the
server uses internally (e.g. what its runtime reads from the database) live
in the server, not here.

## Design notes

- **No OpenAPI/`zod-to-openapi`.** The old codebase used
  `extendZodWithOpenApi`/`zod-to-openapi` pervasively to generate an OpenAPI
  document. This package deliberately skips that in favor of plain
  `.describe()` calls on schema fields, to keep the dependency footprint
  small. Clients in other languages (R, Python) are instead served via
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

Writes `dist/json-schema/{researcher,coder}-api.json`, one per API: for
every endpoint, the HTTP method, path, and a JSON Schema for both the
request and response body. This output is not checked into git (see
`.gitignore`); regenerate it whenever the contract changes.

## Endpoints

Documented per API in [`docs/api/`](../../docs/api/README.md), with a
section per endpoint. The registries: `src/endpoints/researcher.ts` and
`src/endpoints/coder.ts`.

| API | Called by | Registry | Spec |
|---|---|---|---|
| researcher API | researcher UI, R, Python, other systems | `researcherEndpoints` | [researcher.md](../../docs/api/researcher.md) |
| coder API | coders' browsers | `coderEndpoints` | [coder.md](../../docs/api/coder.md) |

## Auth

Not modeled in this package: the contract never sees credentials.

- **Coders**: an httpOnly session cookie the server sets, plus the
  `x-annotinder: 1` header against CSRF (`docs/coder-identity.md`). The
  client never sees the session key.
- **Researchers**: a personal API key, `authorization: Bearer <key>`
  (`account.ts`); the role per job is in job users (`job.ts`). Development
  servers also accept `x-dev-role` / `x-dev-email` headers. Login for the
  web UI is still to do.
