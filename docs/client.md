# Client: design decisions

Status: current (2026-10-15). Collects the client-side decisions from the
former `annotinder-client_design_plan.txt` that still hold. Server-side
design lives in `architecture.md` and `coder-identity.md`; the API in
`packages/contracts/CONTRACTS.md`.

## 1. Packaging

- `packages/client` builds two ways: a standalone SPA (the dev shell,
  `src/App.tsx`) and a component library (`@annotinder/client`,
  `src/lib/index.ts`).
- **Components, not routes.** `JobRunner` (coding) and `AdminApp`
  (research management) are plain components a host app drops into its own
  React tree. There is no router dependency. `AdminApp` brings its own
  TanStack `QueryClientProvider` unless the host passes a `queryClient`.
- **CSS.** `src/lib/index.ts` imports `../index.css`, so the library build
  emits `style.css`. Its output name is pinned in `vite.lib.config.ts`
  (`assetFileNames`), because Vite's default changed once and broke the
  `exports["./style.css"]` path.
- **Hosting.** The client and the job server always share an origin (needed
  for the httpOnly session cookies planned in
  `plan-trust-sessions-codings.md`).
- Not published to npm yet.

## 2. JobManager (coding runtime)

`src/lib/jobManager/JobManager.ts` is a framework-agnostic state machine;
`useJobManager` binds it to React with `useSyncExternalStore`.

- It talks only to the `JobServer` interface (`api/httpJobServer.ts`). Tests
  use stubs.
- It computes the visible steps from the codebook: top-level items, then
  loop questions, with conditions evaluated per step (§5).
- Navigation: back and forward, jumping to a phase, unit or question. Unit
  history is kept **per loop**. On resume it is rebuilt from the session's
  finished unit ids, and units are loaded lazily (`architecture.md` §8.1).
- `currentUnitVariables` on the snapshot exposes the current unit's answers
  so far. Relation questions need it to find sibling span answers.
- `start()` is idempotent (React StrictMode runs effects twice).
  `retry()` re-runs the last failed operation; this is safe because writes
  are full replaces.

## 3. Unit layout

A unit's layout is **one markdown template** (`UnitLayoutSchema`:
`template`, `style?`, `constants?`, `meta?`). It replaced the old app's
typed field arrays and grid arrangement.

- Rendering: `react-markdown` + `remark-gfm` + `remark-directive`. Raw HTML
  is not supported (no `rehype-raw`), so templates are XSS-safe by
  construction. Root styling uses `style`, a React style object.
- **Directives** (`codebook/unitFieldDirective.ts`):
  - `::field[name]`: inject a value. `{markdown=true}` renders it as
    markdown; `{as="image"}` renders an image URL.
  - `::tokenize[name]`: render text that span questions can annotate.
  - `name` resolves against unit data columns plus the layout's
    `constants`, never against rendered output. That keeps span offsets
    tied to one stable string.
  - `markdown=true` and `::tokenize` don't combine: rendered markdown no
    longer matches the raw string's offsets. This is documented, not yet
    enforced.
- **`constants`**: named strings versioned with the codebook. Used for
  annotatable text that isn't a unit column, and for conditional content
  (e.g. per experimental group).
- **`{{ expression }}`** blocks are JavaScript, evaluated in the QuickJS
  sandbox (§5) against unit data, constants and coder variables. They are
  resolved in `JobManager.resolveUnitLayout`, because evaluation is async
  and rendering is not. `::field` and `::tokenize` are left untouched, so
  offsets stay exact.

## 4. Span and relation answers

- Span and relation questions are ordinary steps in the question flow, not
  a separate "annotation mode". `JobRunner` mounts a `SpanAnnotationProvider`
  while a span question is active. `UnitFields` then renders the matching
  `::tokenize` text as `SelectableText`.
- Spans are stored as **character offsets** (`offset`, `length`) plus the
  selected `text` (redundant, but saves analysis a re-slice). No
  tokenization library. Selection can still snap to words.
- Overlapping spans are rejected when selecting. Clicking a highlighted span
  removes it. Earlier spans of a resumed unit are passed in as
  `initialSpans`.
- Relations link two existing spans of sibling span questions (`from`/`to`)
  with a code, picked from dropdowns labelled with the span text.

## 5. Scripting sandbox: QuickJS

`condition` expressions and `{{...}}` template blocks are plain JavaScript,
run in **QuickJS** (`quickjs-emscripten-core` with the single
`@jitl/quickjs-wasmfile-release-sync` variant, to keep the bundle small).
Each evaluation has a 500 ms interrupt deadline and a 1 MB memory limit.

Why not CEL: CEL is safe by design, but its bindings outside Go are thin;
there is none for R. JavaScript is better known by codebook authors, R can
run it via `V8` (Jeroen Ooms' package), and scripts stay plain JS that any
engine can run later. That suits reproducibility.

The job server can't evaluate conditions yet. Server-side semantic
validation would use the same sandbox (`architecture.md` §10).

## 6. Recomputation and caching

There is no hand-maintained trigger graph. Instead there is one recompute
pass with per-slot memoization:

- `codebook/dependencies.ts`: `extractDependencies` finds which known
  variable names an expression mentions, via a whole-word regex. This
  over-approximates, which is safe.
- `codebook/expressionCache.ts`: `ExpressionCache.evaluate(key, expression,
  values)` re-runs QuickJS only when one of those dependencies changed.
- `JobManager` owns one cache per session and passes it to step
  computation and template rendering. Changing units needs no explicit
  invalidation: dependency values change, so entries miss.

## 7. Admin UI

`components/admin/AdminApp.tsx` is a tabbed shell: Settings, Codebook,
Units, Unitsets, Coders, Preview. It uses an `AdminClient`
(`api/httpAdminClient.ts`).

- **Codebook editor**: edits the whole document in memory (tree view and
  YAML), validated client-side with the contract's `validateCodebookItems`,
  then saved as a whole. A deployed codebook is immutable; "Duplicate"
  makes an editable copy. Unit loops have a distribution editor
  (`UnitLoopForm.tsx`).
- **Units**: CSV upload with a small built-in parser (`admin/csv.ts`).
  Units are immutable once used.
- **Unitsets**: manual selection, or "Split into parts…"
  (`POST /unitsets/generate`).
- **Coders**: invites (login requirement, participant id, preset variables,
  max uses) and a progress table.
- **Preview** runs the job's latest codebook (deployed or not) on the job
  server as deployment `<backend>.<jobId>.preview`, with a token from
  `POST /job/:jobId/deployment/preview`. Coders and answers stay in the job
  server's memory; nothing reaches the db server (`architecture.md` §5).

## 8. Tooling notes

- Node ≥ 22. The mock server uses the built-in `node:sqlite`, loaded via
  `createRequire` because Vite/Vitest don't resolve it as a builtin.
- Vitest configs exclude `**/dist/**`. Otherwise built test files run
  twice after `tsc -b`.
- Tailwind 4 (CSS-first `@theme`); `tw-animate-css` is imported without
  `layer(base)`.
- TypeScript 7 waits for typescript-eslint support.
- Keep dependencies minimal (e.g. no CSV library).

## 9. Known gaps

- Admin UI: last write wins when two people edit the same codebook (no
  ETag); codebook errors are shown as raw messages, not per field.
- Spans: no re-editing mode (`editMode` in the schema is unused); no
  "click a span to pick it" for relations; no per-field inline styling
  directives; no image-region annotation.
- Tests are render smoke tests plus logic tests. No jsdom interaction tests
  or browser e2e suite in CI yet (browser checks so far are manual
  Playwright runs).
- No visual/UX parity pass against the old app was done.
