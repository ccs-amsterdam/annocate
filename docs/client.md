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
- **Hosting.** The client and the server's coder API (`/d/...`) always
  share an origin: coder sessions are httpOnly cookies
  (`coder-identity.md` §4).
- Not published to npm yet.

## 2. JobManager (coding runtime)

`src/lib/jobManager/JobManager.ts` is a framework-agnostic state machine;
`useJobManager` binds it to React with `useSyncExternalStore`.

- It talks only to the `CoderApi` interface (`api/httpCoderApi.ts`). Tests
  use stubs.
- It computes the visible steps from the codebook: top-level items, then
  loop questions, with conditions evaluated in document order (§5,
  "References and conditions"). Answers of questions a condition now hides
  count as unanswered, in conditions and templates as well as when the unit
  is posted (`skip`).
- It renders the unit layout and the current question's texts
  (`currentUnitTemplate`, `currentTexts` on the snapshot), because
  evaluation is async and rendering is not.
- It chooses the unit loop branch for the coder and tells the server
  (`architecture.md` §6.1).
- Navigation: back and forward, jumping to a phase, unit or question. Unit
  history is kept **per loop**. On resume it is rebuilt from the session's
  finished unit ids, and units are loaded lazily (`architecture.md` §8.1).
- `currentUnitVariables` on the snapshot exposes the current unit's answers
  so far. Relation questions need it to find sibling span answers.
- `start()` is idempotent (React StrictMode runs effects twice).
  `retry()` re-runs the last failed operation; this is safe because writes
  are full replaces.

## 3. Unit layout and texts

A unit's layout is **one markdown template** (`UnitLayoutSchema`:
`template`, `style?`, `constants?`, `meta?`). It replaced the old app's
typed field arrays and grid arrangement. Question and instruction texts are
templates with the same syntax.

- Rendering: `react-markdown` + `remark-gfm` (`components/TemplateMarkdown.tsx`).
  Raw HTML is not supported (no `rehype-raw`), so templates are XSS-safe by
  construction. Root styling uses `style`, a React style object.
- **Values**: `$unit.<field>`, `$const.<name>`, `$var.<q>.code` (all
  references, see "References and conditions") or `{{ js }}`, each with an
  optional suffix:
  - `::text` (default): the value as literal text. It never goes through
    the markdown parser, so `**x**` in unit data shows as `**x**`.
  - `::markdown`: the value rendered as markdown.
  - `::image`: the value is an image URL.
  - `::tokenize`: text that span questions can annotate. Only on a bare
    `$unit.x` or `$const.x` in the layout (validation enforces it), so span
    offsets always point into one stable string, never rendered output.
    Every span question's `column` must be tokenized in the layout.
- `$unit.text` is the same as `{{$unit.text}}`, and `$unit.text::markdown`
  as `{{$unit.text}}::markdown`. `\$` is a literal `$`; references inside
  code spans and fences stay literal. Values become text predictably:
  strings as is, numbers via `String`, arrays joined with `", "`,
  `null`/`undefined` as nothing, objects as JSON.
- How (`codebook/renderTemplate.ts`, `codebook/templateValues.ts`): a
  pre-pass (`parseTemplate` in contracts) replaces every value with a
  placeholder of private-use characters. One that stands alone on its line
  becomes its own block, like a leaf directive. `JobManager` evaluates the
  values (cached, §6). A remark plugin turns the placeholders into
  `<template-value>` elements, rendered by type: a React text node, nested
  markdown, an `<img>`, or `SelectableText`. Placeholders in link and image
  URLs are filled in with the value's text. (Not `remark-directive`: it
  turns ordinary text like `10:30` or `note:this` into directives.)
- **`constants`**: named strings versioned with the codebook. Used for
  annotatable text that isn't a unit column, and for conditional content
  (e.g. per experimental group:
  `{{ $var.group.code === 'a' ? $const.intro_a : $const.intro_b }}::markdown`).
- `$unit` and `$const` only exist inside a unit loop; outside, texts can
  only use `$var`.

## 4. Span and relation answers

- Span and relation questions are ordinary steps in the question flow, not
  a separate "annotation mode". `JobRunner` mounts a `SpanAnnotationProvider`
  while a span question is active. `UnitFields` then renders the matching
  `$unit.<column>::tokenize` value as `SelectableText`.
- Spans are stored as **character offsets** (`offset`, `length`) plus the
  selected `text` (redundant, but saves analysis a re-slice). No
  tokenization library. Selection can still snap to words.
- Overlapping spans are rejected when selecting. Clicking a highlighted span
  removes it. Earlier spans of a resumed unit are passed in as
  `initialSpans`.
- Relations link two existing spans of sibling span questions (`from`/`to`)
  with a code, picked from dropdowns labelled with the span text.

## 5. Scripting sandbox: QuickJS

Script conditions and `{{...}}` template values are plain JavaScript
expressions, run in **QuickJS** (`quickjs-emscripten-core` with the single
`@jitl/quickjs-wasmfile-release-sync` variant, to keep the bundle small).
The only names in scope are `$unit`, `$var` and `$const`. Each evaluation
has a 100 ms interrupt deadline (`EXPRESSION_DEADLINE_MS`) and a 1 MB
memory limit. A script that is a single reference is looked up without
QuickJS. A script that fails counts as false (conditions) or empty
(templates).

Why not CEL: CEL is safe by design, but its bindings outside Go are thin;
there is none for R. JavaScript is better known by codebook authors, R can
run it via `V8` (Jeroen Ooms' package), and scripts stay plain JS that any
engine can run later. That suits reproducibility. Simple conditions don't
need a JS engine at all: rules (below) are evaluated in plain TypeScript.

All conditions are evaluated on the client, including unit loop branches;
the server is only told the chosen branch (`architecture.md` §6.1).

### References and conditions

One reference syntax is used everywhere: scripts, templates, question and
instruction texts, condition rules and unitset names
(`contracts/src/codebook/references.ts`).

| Reference | Meaning | Where |
| --- | --- | --- |
| `$unit.<field>` | unit data column | inside a unit loop |
| `$const.<name>` | layout constant | inside a unit loop |
| `$var.<q>.code` / `.value` | code / numeric value of question `q` | after `q` is asked |
| `$var.<q>.<item>.code` / `.value` | one item of a scale with `items` | after `q` is asked |
| `$var.<q>.text` | selected texts (span questions) | after `q` is asked |
| `$var.<q>.answered` | `true` if answered and not skipped | after `q` is asked |

The shape follows from the codebook, never from the runtime value:

- Scalar (`null` when unanswered): single `select_code`/`search_code`,
  `annotinder`, `scale` without items, `auto`. `.value` comes from the
  answer, or else the code's `value` in the codebook.
- Array (`[]` when unanswered): `multiple: true`, `span` (`.code`, `.text`),
  `relation` (`.code`).
- `confirm`: only `.answered`.

Every question of the codebook is in `$var` (`buildScope`), so a script
never throws on a question that isn't answered yet. Names must be literal:
`$var[x]` or `Object.keys($var)` is an error, so validation can check every
reference. Item names can't be `code`, `value`, `text` or `answered`.

A **condition** (`contracts/src/codebook/condition.ts`) is either rules or
a script, and is used by `condition` items and unit loop branch `when`:

```yaml
condition:                       # rules: match all (default) or any
  match: any
  rules:
    - { ref: $var.experience.code, op: is, value: expert }
    - { ref: $var.topics.code, op: is, value: [politics, economy] }   # array ref: contains any of
    - { ref: $var.interest.tech.value, op: gte, value: 4 }
condition:                       # or a script; truthy = holds
  script: "$var.interest.tech.value >= 4 && $unit.source !== 'blog'"
```

`is`/`isnot` compare with a value, or any/none of an array of values; on
array refs they mean contains / doesn't contain. `gt`, `gte`, `lt`, `lte`
need a numeric ref (`.value`, or a numeric unit field). No rules: always
holds.

**Validation** (`validateCodebookItems`) walks the codebook in document
order and checks every reference in rules, scripts, templates and texts:
the question exists and comes before this point (not the question itself,
not inside the condition's own children, not in another loop); the
property fits its type; rule operators and values fit the reference (codes
must exist); `$unit`/`$const` only inside a loop (unknown `$const` is an
error; unknown `$unit` fields are a warning in the editor, once the job has
units); branch `when` and unitset names only use coder-level `$var` refs
from before the loop; `::tokenize` as described in §3. `.value` on codes
without values is a warning. Script syntax is checked in the admin editor
(QuickJS), not in contracts.

## 6. Recomputation and caching

There is no hand-maintained trigger graph. Instead there is one recompute
pass with per-slot memoization:

- `codebook/dependencies.ts`: `extractDependencies` reads which references
  a script uses (`extractReferences`, skipping strings and comments) and
  their current values. Names are literal, so this is exact. Scripts with
  computed references aren't cached.
- `codebook/expressionCache.ts`: `ExpressionCache.evaluate(key, script,
  scope)` re-runs QuickJS only when the script or one of those values
  changed.
- `JobManager` owns one cache per session and passes it to step
  computation, branch choice and template rendering. Changing units needs
  no explicit invalidation: dependency values change, so entries miss.

## 7. Admin UI

`components/admin/AdminApp.tsx` is a tabbed shell: Overview, Codebook,
Units, Invitations, Coders, Preview. It uses a `ResearcherApi`
(`api/httpResearcherApi.ts`).

- **Codebook editor**: edits the whole document in memory (tree view and
  YAML), validated client-side with the contract's `validateCodebookItems`,
  then saved as a whole. Versions (`codebook/versions.ts`,
  docs/plan-codebook-publishing.md): coders get the *live* version (the
  deployment's codebook); the editor works on the *draft* (the latest
  version, if unpublished); older versions are read-only history that can be
  restored as the draft. Editing the live version saves a new draft.
  **Publish** (`PUT /deployment`) makes the draft live and freezes it; its
  dialog lists the changes against the live version (`codebook/diff.ts`).
  Unit loops have a distribution editor (`UnitLoopForm.tsx`).
  Condition items and branch `when` use `ConditionEditor.tsx`: a
  **Rules | Script** toggle. In rules mode the reference picker lists only
  what validation accepts at that point (`availableQuestions` +
  `referenceOptions` from contracts), and the value is a set of code
  toggles when codes are known. Script mode has a cheat sheet of
  references and a QuickJS syntax check. Rules → Script pre-fills the
  equivalent script (`rulesToScript`); Script → Rules discards the script
  after a confirm. Validation messages (errors red, warnings amber) show
  under the condition, template and question fields; only errors block
  saving.
- **Units** (`units/`): units and unitsets on one page. CSV upload with a
  small built-in parser (`admin/csv.ts`) that infers field types and shows
  them before uploading; a paged table with a column per field and unitset
  badges; pick a set to see its units in order; make a set from selected
  units, or split units into parts (done client-side with `splitUnits`).
  Units are immutable once used. The codebook editor warns about `$unit.x`
  references to fields that don't exist (`codebook/unitFieldRefs.ts`).
- **Overview** (`overview/`): live/paused/unpublished, the live and draft
  codebook versions (open them in the editor), unit/coder/invitation counts,
  answers per day (`GET /overview`), progress per loop
  (`GET /deployment/status`), and the job settings (rename, archive, delete).
- **Invitations**: create links (login requirement, participant id, preset
  variables, max uses) and a table of all of them with uses and status;
  revoke (no new coders), or delete while unused.
- **Coders**: per coder the invitation, started, last active, answers, and
  finished units per loop of the live codebook (docs/plan-job-admin.md).
- **Preview** runs the job's latest codebook (deployed or not) as
  deployment `<jobId>.preview`, with a token from
  `POST /job/:jobId/deployment/preview`. Coders and answers stay in the
  server's memory; nothing is stored (`architecture.md` §5).

## 8. Tooling notes

- Node ≥ 22. The server (`packages/server`) stores its data in Postgres:
  PGlite in tests and development (no Postgres install needed).
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
