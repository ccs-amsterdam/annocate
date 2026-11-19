# @annotinder/contracts

The shared, framework-agnostic API contract between an annotinder-client
frontend and any compliant server backend. This package contains only zod
schemas, their inferred TypeScript types, and small pure helper functions
(position parsing, design validation) — no server or client
runtime code, no HTTP client, no React.

The server (`packages/server`) implements the three APIs: the researcher
API (studies, designs, units, deploying; used by the researcher UI, R,
Python and other systems), the coder API (used by coders' browsers) and the
admin API (server admins). Types the
server uses internally (e.g. what its runtime reads from the database) live
in the server, not here.

## Design notes

- **No OpenAPI/`zod-to-openapi`.** Schema fields carry plain
  `.describe()` calls, to keep the dependency footprint small. Clients in other languages (R, Python) are instead served via
  `pnpm generate:json-schema`, which walks the endpoint registry and emits a
  plain JSON Schema document per endpoint (see below) — enough to validate
  request/response shapes without needing an OpenAPI toolchain.
- **The design as a tree** (`docs/architecture.md` §6, `docs/glossary.md`).
  A design version is one JSON document: `public`, `session`, `units` (the
  declared unit fields) and `items`, a list of top-level items where
  `unit_loop` and `show_if` items nest their `children`. Item types:
  `session` (first, at most one), `question`, `computed`, `unit_loop`,
  `show_if` and `end`. A question inside a loop is unit-level, outside it
  coder-level; loops don't nest; `span` and `relation` questions only
  inside a loop; item names are unique within a design.
  `validateDesignItems` (`src/design/validation.ts`) checks these rules and
  every reference, and `DesignItemsSchema` runs it whenever a design is
  parsed. The coders' view of a design is the coder codebook
  (`src/design/coderCodebook.ts`).
- **Question types and answers** (`docs/client.md` §4). Options are
  `{ value, label?, color? }`: the value is stored and compared, the label
  shown; nominal values are strings, ordinal values numbers rising in
  option order (`src/design/options.ts`). Types: `nominal`,
  `ordinal`, `numeric`, `scale`, `annotinder`, `confirm`, `unspecified`
  (not chosen yet), and in loops `span` and `relation`; computed items have
  the variable type `random` (`src/design/variableTypes.ts`); plus the `end` item
  (`src/design/item.ts`). `resolveLayout` (`src/design/answerLayout.ts`)
  says how a question is laid out.
- **References and conditions** (`docs/client.md` §5):
  `src/design/references.ts` (references, their shapes, scopes),
  `src/design/condition.ts` (conditions are scripts; helper methods;
  simple conditions parsed and evaluated without a JS engine).
- **`VariableValue` is intentionally loose.** A coder's answer for a
  single variable (`src/variableValue.ts`) is a single object with optional
  `values`/`spans`/`relations` arrays rather than a schema-per-variable-type
  discriminated union; `validateAnswer` (`src/design/answers.ts`) checks
  it against the variable. A discriminated union is an open item
  (`docs/architecture.md` §11).

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
section per endpoint. The registries: `src/endpoints/researcher.ts`,
`src/endpoints/coder.ts` and `src/endpoints/admin.ts`.

| API | Called by | Registry | Spec |
|---|---|---|---|
| researcher API | researcher UI, R, Python, other systems | `researcherEndpoints` | [researcher.md](../../docs/api/researcher.md) |
| coder API | coders' browsers | `coderEndpoints` | [coder.md](../../docs/api/coder.md) |
| admin API | the server admin page | `adminEndpoints` | [admin.md](../../docs/api/admin.md) |

## Auth

Not modeled in this package: the contract never sees credentials.

- **Coders**: an httpOnly device cookie the server sets, plus the
  `x-annotinder: 1` header against CSRF (`docs/coder-identity.md`). The
  client never sees the session key.
- **Researchers**: the session cookie after login (with `x-annotinder: 1`),
  or a personal API key, `authorization: Bearer <key>` (`account.ts`); the
  role per study is in study users (`study.ts`). Development servers also accept
  `x-dev-role` / `x-dev-email` headers.
