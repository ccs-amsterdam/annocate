# Client: design decisions

Status: current (2026-10-26). Server-side design lives in
`architecture.md` and `coder-identity.md`; the APIs in `docs/api/`.

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
- **Hosting.** The client and the server always share an origin: coder and
  researcher sessions are httpOnly cookies (`coder-identity.md` §4, §7).
  In development, Vite proxies `/d`, `/job`, `/me` and `/auth` to the
  server. Only scripts with API keys call the server from elsewhere.
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
- An `end` item that is reached is the last step: it tells the server and
  publishes the ending (§4 "End items").
- Navigation: back and forward, jumping to a phase, unit or question. Unit
  history is kept **per loop**. On resume it is rebuilt from the session's
  finished unit ids, and units are loaded lazily (`architecture.md` §8.1).
- `currentUnitVariables` on the snapshot exposes the current unit's answers
  so far. Relation questions need it to find sibling span answers.
- **A new codebook version while coding**: the server answers 409
  `codebook_changed` to answers given under the old version
  (`api/coder.md`). `JobManager` then loads the session again, as after a
  reload, and returns to the unit the coder had open with their unsaved
  answers to it, as far as they fit the new version; a question the new
  version added is asked. At most the last coder-level answer is asked
  again.
- `start()` is idempotent (React StrictMode runs effects twice).
  `retry()` re-runs the last failed operation; this is safe because writes
  are upserts.

## 3. Unit layout and texts

A unit's layout is **one markdown template** (`UnitLayoutSchema`:
`template`, `style?`, `constants?`, `meta?`). It replaced the old app's
typed field arrays and grid arrangement. Question and instruction texts are
templates with the same syntax.

- Rendering: `react-markdown` + `remark-gfm` (`components/TemplateMarkdown.tsx`).
  Raw HTML is not supported (no `rehype-raw`), so templates are XSS-safe by
  construction. Root styling uses `style`, a React style object.
- **Values**: `$unit.<field>`, `$const.<name>`, `$var.<q>.label` (all
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
- **Blocks** (contracts `templateBlocks.ts`): lines starting with `:::`,
  as Pandoc's fenced divs, show part of a template conditionally or
  styled:

  ```
  ::: if $var.group.is('experiment')      :::: from topics
  $const.experiment_banner::markdown      ::: style font-size: 90%
  ::: else if <script>                    You rated it $var.sentiment.label
  ...                                     :::
  ::: else                                ::::
  $const.control_banner::markdown
  :::
  ```

  - `if` / `else if` / `else`: the first branch whose condition holds (the
    same scripts as condition items) shows.
  - `from <question>`: shows from that question of the loop on (also when
    it is skipped); consecutive `from` fences form a chain of which the
    last reached stage shows, so a layout can change as the coder goes
    through the unit's questions. Only in a loop's layout. Inside a stage
    the loop's questions before its question can be used (validation).
  - `style <css>`: the content in a `<div>` with that inline CSS (a React
    style object: per property, so it can't add selectors or run code;
    `position: fixed/sticky` is refused so text stays in the unit area).
    Researchers are trusted with how their job looks.
  - A bare `:::` closes the innermost block and must have as many colons
    as its opening fence, so nested blocks use more colons outside.
    Fence lines are not text; fences in code stay literal.

  Rendering (`renderTemplate`): conditions are evaluated (cached, like
  values), the chosen text is put together, and a style block's content
  sits between two marker paragraphs that `remarkTemplateValues` turns
  into a `<template-style>` element. `JobManager` passes the question on
  screen and the loop's question order for `from`.
- **Field markers**: the element of every bare `$unit.<field>` value has
  `data-field="<field>"` (an attribute, not an `id`: a field may be used
  twice, and ids could clash with the app's). A question's optional
  `field` (in the form: "Show field"; a span question uses its `column`)
  makes `UnitFields` scroll that field into view and highlight it briefly
  when the question comes up. Validation checks the layout shows it.
- **`constants`**: named strings versioned with the codebook. Used for
  annotatable text that isn't a unit column, and for longer texts used in
  blocks (e.g. a banner per experimental group).
- `$unit` and `$const` only exist inside a unit loop; outside, texts can
  only use `$var`.

## 4. Questions and answers

### Options: a value and a label

Every option is `{ value, label?, color? }` (`contracts/src/codebook/options.ts`),
as in SPSS or Stata value labels:

- **The value** is what is stored, compared in conditions and exported.
  Values are unique within a question. Changing one in a published codebook
  changes what earlier answers mean; the publish dialog warns
  (`codebook/diff.ts` `valueChanges`).
- **The label** is what coders see (default: the value). It can change
  without touching data.
- **The measurement level decides the type of the values.** Nominal:
  strings, standardized terms (`human_interest`), non-empty, trimmed,
  unique; the editor derives the value from the label until it is edited
  by hand. Ordinal (and scales): numbers rising in option order (default
  1..n), so comparing values compares order. Switching a question between
  nominal and ordinal converts the values: to ordinal 1..n (an old value
  becomes the label if there was none), to nominal values derived from the
  labels (`convertOptionsLevel`).

### Types

| Type | What | Stored (`VariableValue`) |
| --- | --- | --- |
| `nominal` | pick from categories; `multiple` for several answers | `values: [{ value }]`, several with `multiple` |
| `ordinal` | pick from ordered options | `values: [{ value }]` |
| `numeric` | one number (interval/ratio); `min`, `max`, `step` (default 1), break-point `labels` | `values: [{ value }]` |
| `scale` | `items` rated on the same ordinal `options` (a Likert battery) | `values: [{ item, value }]`, one per item |
| `annotinder` | swipe a card: 2 or 3 options, in the order left, right, up | `values: [{ value }]` |
| `confirm` | a button | nothing besides `done` |
| `auto` | assigned, not asked (random, balanced, invite, URL parameter) | `values: [{ value }]` |
| `span` | select text in the unit (loops only) | `spans: [{ id, field, value, slices }]` |
| `relation` | link two spans (loops only) | `relations: [{ id, fromId, toId, value }]` |

Answers hold values, never labels. `validateAnswer` (contracts) checks them
against the current codebook: values of the options, one per item for a
scale, at most one unless `multiple`, numbers within `min`/`max` and on the
`step` grid (from `min`, or 0).

The answer types follow the measurement levels researchers know: nominal,
ordinal, numeric (interval and ratio look the same to a coder, so they are
one type). Nominal and ordinal share their answer form
(`CategoricalAnswerField`) and layouts.

Codebooks in the shape before 2026-10 (`select_code`, `search_code`,
`scale` without items, `codes`, rules conditions, and the short-lived
`categorical` with a `level`) are migrated on parse
(`contracts/src/codebook/migrate.ts`), also when the server serves a stored
one; `screenOut` on codes is dropped (use an `end` item).

### Layout: fixed and compact

`layout: "auto"` (the default) is fixed per question, not per device, so
every coder sees the same form and devices don't become a mode effect.
`resolveLayout` (`contracts/src/codebook/answerLayout.ts`) picks it for the
smallest phones (about 360 px wide) within half such a screen's height; the
editor shows what `auto` picks, and `layoutWarning` warns when a chosen
layout doesn't fit. Buttons are about 40 px tall.

- Nominal and ordinal: `row` (one row, equal buttons), `grid` with
  `columns`, `flex` (wrapping; nominal only), `compact` (ordinal only:
  buttons show the value, the selected one grows and shows its label),
  `dropdown` (a combobox with a filter box).
  Auto, nominal: a row for 2-3 short labels, else 2 columns, else 1 column,
  else a dropdown. Auto, ordinal: a row for 2-3 options, else 1 column
  (order reads top to bottom), else compact.
- Numeric: `buttons` (auto when the range has at most 11 values), `slider`
  (larger closed ranges), `input` (open ranges).
- Scale: `compact` (a row per item, default) or `grid` (a table).
- Single questions never need scrolling. A scale may: Continue then
  scrolls to the first unanswered item and highlights it, so no item is
  skipped unnoticed.

Number keys 1-9 pick an option; one answer is given on the first click,
several are confirmed with Continue.

**Swiping** (`annotinder`, `components/SwipeCard.tsx`): in a unit loop the
unit itself is the card; outside one, the question card. The coder drags
it left, right or up (1st, 2nd, 3rd option); while dragging it tilts and
shows the option for that direction. Released past 30% of its width (100+
px up), or flung, it flies off and that option is the answer; otherwise it
springs back. The answer pane keeps the question with a compact row of
direction buttons (left, up, right), and the arrow keys work too; both fly
the card off the same way. Pointer events, no gesture library. Long units
still scroll: vertical drags are the browser's (`touch-action: pan-y`),
except an upward drag once the content is at its bottom (then `pan-up`, so
the browser only scrolls back up). Without a card (the editor's preview)
the buttons answer directly.

### Span and relation answers

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
  with one of the relation's options, picked from dropdowns labelled with
  the span text.

### End items

An `end` item ends the coder's session when the coder reaches it, usually
inside a condition: `outcome` `screenout` or `complete`, an optional
`message` (a template) and an optional `redirectUrl`, e.g. a panel
company's return link, whose `$var` references are filled in URL-encoded.
`JobManager` tells the server (`POST /end`; in a loop after saving the
unit) and shows the ending (`SessionEnd.tsx`, redirecting after a few
seconds). The server stores the outcome; the session then refuses units and
answers (409 `session_ended`), and a reload shows the ending again.

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
need a JS engine at all: they are evaluated in plain TypeScript (below).

All conditions are evaluated on the client, including unit loop branches;
the server is only told the chosen branch (`architecture.md` §6.1).

### References and conditions

One reference syntax is used everywhere: scripts, templates, question and
instruction texts, conditions and unitset names
(`contracts/src/codebook/references.ts`). The name says the shape:

| Reference | Meaning | Questions |
| --- | --- | --- |
| `$unit.<field>` | unit data column (inside a unit loop) | |
| `$const.<name>` | layout constant (inside a unit loop) | |
| `$var.<q>.value`, `.label` | the answer; `null` when unanswered | single nominal, ordinal, numeric, swipe, auto |
| `$var.<q>.values`, `.labels` | the answers; `[]` when unanswered | nominal with `multiple`, span, relation |
| `$var.<q>.texts` | the selected texts | span |
| `$var.<q>.values` | all items' values, in item order | scale |
| `$var.<q>.items.<item>.value`, `.label` | one item | scale |
| `$var.<q>.answered` | answered and not skipped | any |

Using `.value` on a multiple-answer question or `.values` on a single one
is a validation error, and so is the old `.code`. A numeric answer's label
is its break-point label, if it has one. Every question of the codebook is
in `$var` (`buildScope`), so a script never throws on a question that isn't
answered yet. Names must be literal: `$var[x]` or `Object.keys($var)` is an
error, so validation can check every reference.

**Helper methods** are called on the question (or a scale item), so
validation knows the type and checks both the method and its arguments.
Every method is false (`count()`: 0) while the question is unanswered.

| Question | Methods |
| --- | --- |
| single (nominal, swipe, auto) | `is(v)`, `isAny(v1, v2, ...)` |
| ordinal, scale items (`$var.q.items.x`) | also `gt(v)`, `gte(v)`, `lt(v)`, `lte(v)` |
| nominal with `multiple` | `has(v)`, `hasAny(...)`, `hasAll(...)`, `count()` |
| numeric | `eq(n)`, `gt(n)`, `gte(n)`, `lt(n)`, `lte(n)`, `between(a, b)` |
| span, relation | `has(v)`, `count()` |

They compare values (never labels), with strict equality: `is("2")` never
matches the ordinal value `2`. `applyHelper` (contracts) is the TypeScript
implementation; `HELPER_PRELUDE` adds the same methods to `$var` inside
QuickJS; a client test checks that both agree.

A **condition** (`contracts/src/codebook/condition.ts`) is a script, used by
`condition` items and unit loop branch `when`; truthy = holds:

```yaml
condition:
  script: $var.topics.has("sports") && ($var.edu.gte(3) || !$var.consent.answered)
```

- A **simple** condition uses only helper calls, `.answered`, `true`,
  `false`, `&&`, `||`, `!` and parentheses (`count()` with a comparison:
  `$var.topics.count() >= 2`). It is parsed (`parseSimpleCondition`) and
  evaluated in TypeScript (`evaluateSimpleCondition`), without QuickJS.
- Anything else is an **advanced** script, run in QuickJS with the same
  references and helpers, e.g. `$var.age.gte(18) && $unit.source !== "blog"`.

**Validation** (`validateCodebookItems`) walks the codebook in document
order and checks every reference in scripts, templates and texts: the
question exists and comes before this point (not the question itself, not
inside the condition's own children, not in another loop); the property or
method fits its type; `$unit`/`$const` only inside a loop (unknown `$const`
is an error; unknown `$unit` fields are a warning in the editor, once the
job has units); branch `when`, unitset names and end item redirect URLs
only use coder-level `$var` refs from before the loop; `::tokenize` as
described in §3. In simple conditions the helper arguments are checked too:
their number, and that they are values of the question's options (numeric:
numbers within its range). In advanced scripts references are checked,
values not. Script syntax is checked in the admin editor (QuickJS), not in
contracts.

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
Units, Invitations, Coders, Results, Preview. It uses a `ResearcherApi`
(`api/httpResearcherApi.ts`).

- **Login**: `account/ResearcherGate.tsx` shows its children to a logged-in
  researcher and a login screen otherwise (with the 2FA recommendation and
  the reason a login was refused); `account/AccountMenu.tsx` has the
  researcher's email, their API keys and logging out
  (`docs/coder-identity.md` §7). The dev shell (`App.tsx`) uses them when
  the server has login, and development headers when it doesn't.

- **Codebook editor**: edits the whole document in memory, validated
  client-side with the contract's `validateCodebookItems`, and saved as a
  whole with Save. Views:
  - **Visual**: the item tree, and the selected item as a form, as JSON
    (`codebookEditor/ItemJsonEditor.tsx`: the item without its children,
    which are items of their own), or as a preview. The tree shows
    questions with the icon of their answer type, unit loops with their
    unitsets (or "n branches"), and conditions by their condition, or by
    their optional `label`. Conditions and unit loops have no name
    (names of questions are variables, of end items the stored way a
    session ended): a loop is identified by its position and shows its
    label, or "Unit loop" (with its unitsets next to it; messages and
    exports, which have no tree, say "Unit loop <n>", `architecture.md`
    §6.1). New loops and conditions start empty. Until 2026-10-27
    every item had a name; old condition names are dropped on parse, old
    loop names become labels.
    Adding: a row's + (on hover) adds an item below it: after an item, at
    the top of a loop or condition's children. Only the end of a container
    is ambiguous (after its last item, or inside an empty container, is
    also after the container, and so on outwards): there the menu asks
    where first, each place a level further out marked with one more
    "outdent" icon (`addPositions` in `codebook/codebookEdit.ts`).
    Moving and deleting work on ticked items (a container brings its
    children), from the toolbar above the tree: Delete asks once. Move
    turns each row's + into "move below this item", at the same place (the
    tree doesn't shift), on rows below which all ticked items may go (and
    where it changes something); where that is ambiguous it asks, as
    adding does. "Move to the top" is in the toolbar. The items keep
    their order.
  - **JSON**: the whole codebook (`CodebookJsonEditor.tsx`). JSON rather
    than YAML: the structure is explicit (no indentation to get right in a
    browser), and the editor (Monaco, bundled and loaded only with the
    editor: `jsonEditor/`) completes and checks it against the codebook's
    JSON Schema (contracts `codebookItemsJsonSchema`), with the schemas'
    descriptions on hover. Formatting (`codebook/jsonFormat.ts`) keeps small
    objects on one line (an option: `{ "value": "neg", "label": "Negative" }`)
    and puts keys in reading order (`name`, `type`, `value`, `label` first,
    `children` last).
  - Both JSON views apply an edit as soon as it parses to items the tree
    can show (`codebook/itemShape.ts`; items keep their identity by name,
    conditions by place);
    until then "Not applied" says why. Validation shows the rest, as for
    the forms.

  The toolbar counts errors and warnings; each opens a list in which a
  click opens the item concerned. Unsaved edits are the researcher's own;
  the saved draft is shared with co-editors; publishing gives a version to
  coders. So:
  - **Save** works while the codebook has issues (work in progress);
    publishing and previewing need a valid codebook.
  - A save carries the `revision` it is based on. If someone else saved
    meanwhile, a dialog says who and when, and offers "Save mine over
    theirs" or "Discard mine, load theirs".
  - **Undo/redo** buttons (`codebook/editHistory.ts`): the last 100 steps,
    kept in memory as whole snapshots (cheap: unchanged items are shared).
    Changes less than a second apart are one step, so typing a word is one
    step, and occasionally two quick edits are too.
  - Items with unsaved changes have a dot in the tree. **Revert** opens a
    menu listing them ("Revert item": one back to the last save; a new item
    is removed) and "Revert all changes".
  - A draft is deleted only from the versions dialog ("Delete draft", with
    a confirm), so it isn't mistaken for dropping unsaved changes.
  - **Backup**: unsaved edits are copied to the browser's localStorage a
    second after each change (`codebook/localBackup.ts`; one backup, the
    codebook being edited; none if it doesn't fit), and cleared when they
    are saved or discarded. After the browser was closed, a banner anywhere
    in the researcher area offers to continue editing them (with the
    revision they were based on, so the conflict check still applies) or
    to discard them.

  Unit loops have two tabs (`UnitLoopForm.tsx`). **Units**: per branch
  which units coders get (All units, Units shared among coders, One set per
  coder, The invitation's units; `architecture.md` §6.1) with that mode's
  settings, an optional overlap set, and the loop's order. A unitset field
  is empty for all units. "Different units for different coder groups"
  turns on branches, where every branch but the last has a condition
  ("if", "else if") and the last is "otherwise". **Layout**: the template,
  in Monaco (lazy, as the JSON editors: `jsonEditor/MonacoTemplate.tsx`)
  as its own language (markdown with references, suffixes and `{{ }}`
  highlighted) with completions after `$` (unit fields, the loop's
  constants, questions) and `::`; and the constants (name, text). The
  layout's `style` and `meta` are only in the JSON views.
  Forms show few tips (instruction buttons may come later).
- **Versions and publishing** (as in Qualtrics or REDCap: edit a draft,
  publish it), derived from `GET /codebook` and `GET /deployment`
  (`codebook/versions.ts`):
  - *live*: the version coders get (the deployment's codebook), frozen,
    since annotations refer to it (`codebookId`);
  - *draft*: the latest version, if it isn't frozen; what the editor and
    Preview work on;
  - *history*: every other version, read only; can be restored as the
    draft.

  Editing the live version saves a new draft; coders keep the live one
  until it is published. A status banner says which you're looking at and
  what to do next. **Publish** (`PUT /deployment`) makes the draft live and
  freezes it. Its dialog lists the changes against the live version
  (`codebook/diff.ts`), prefills the version note (versions are numbered,
  with an optional `note`) and shows the server's warnings (e.g. a loop
  gained questions, which reopens finished units). Coders who are working
  switch to the new version when they next save (§2), keeping the answers
  to the unit they have open; saved answers stay linked to the version they
  were given under.
  The publish dialog also warns when option values disappear or a
  question's type changes, e.g. from nominal to ordinal (earlier answers
  no longer fit).
  The answer type select converts between nominal and ordinal, keeping
  the options (`switchVariableType`); other switches start from the type's
  defaults, keeping the question text.
  Questions are edited per type (`VariableTypeForm.tsx`): the options
  editor (`OptionsEditor.tsx`: label, value, colour, order; nominal values
  follow the label until edited; ordinal values are 1..n in option order
  and renumbered when options move, unless "Custom values" is on, which
  isn't stored: options that aren't 1..n open with it on;
  swipe options show their direction), `multiple`, a layout
  select whose `auto` entry names what auto picks, and for numeric
  questions the range, step presets and break-point labels.
  Condition items and branch `when` use `ConditionEditor.tsx`: a
  **Rules | Script** toggle over the same script. Rules mode reads and
  writes simple conditions that are a flat list of rows, all joined by
  "and" or all by "or" (`codebook/conditionRules.ts`): per row a question
  (or scale item) available at that point (`availableQuestions`), an
  operator that fits its type (is, is one of, ≥, has any of, count ≥, is
  answered, ...) and its values as toggles or number inputs. A row that
  doesn't fit its question (any more: the question is gone, changed type
  or lost an option) stays a row and is written back unchanged; its
  invalid parts are marked and it says why in words (`rowProblems`, with
  the messages of validation: `"age" is a nominal question, which does
  not support "lower than" comparisons; use "is" or "is one of"`). Other
  scripts open in script mode, with a cheat sheet of references and helpers and a
  QuickJS syntax check. Validation messages (errors red, warnings amber)
  show under the condition, template and question fields; only errors
  block saving.
- **Units** (`units/`): units and unitsets on one page. CSV upload
  (`UploadUnits.tsx`, with a small built-in parser, `admin/csv.ts`): choose
  or drop a file, pick the id column, then per column whether it is
  uploaded and as which field, and its type (inferred from the values;
  checked before uploading, with the values that don't fit). A column named
  like a field of the job is linked to it and keeps its type; "Use column
  names" gives every other column its own name, made valid
  (`toUnitFieldName`). Fields of the job that no column gives are empty, and
  new names add fields. A preview shows the first units as stored; a paged table with a column per field and unitset
  badges; pick a set to see its units in order; make a set from selected
  units, or split units into parts (done client-side with `splitUnits`).
  A coded unit can only be replaced by uploading it again, after a warning (its answers keep the version their coder saw). The codebook editor warns about `$unit.x`
  references to fields that don't exist (`codebook/unitFieldRefs.ts`).
- **Overview** (`overview/`): live/paused/unpublished, the live and draft
  codebook versions (open them in the editor), unit/coder/invitation counts,
  answers per day (`GET /overview`), progress per loop
  (`GET /deployment/status`), and the job settings (rename, archive, delete).
- **Invitations**: create links (login requirement, participant id, preset
  variables, max uses, units) and a table of all of them with uses, units
  and status; revoke (no new coders), or delete while unused. An
  invitation's units are what its coders get in loops with "The
  invitation's units" (it warns about invitations without units when the
  live codebook has such a loop). "Divide units over coders"
  (`DivideUnits.tsx`) splits all units or a unitset into one part per named
  coder plus an overlap set, and makes a personal invitation per coder with
  their part.
- **Coders**: per coder the invitation, started, last active, answers,
  finished units per loop of the live codebook, and how the session ended
  at an `end` item, if it did (`ended`).
- **Results** (`ResultsPanel.tsx`, `admin/exportData.ts`): one zip,
  built in the browser from the researcher API (all pages of
  `GET /annotations` and `GET /unit-versions`, `GET /coders`, and the
  codebook versions answers were given under), with `fflate`:
  - `annotations.csv`: a row per unit and coder (with the unit version
    they saw and the codebook version), a column per question (a scale a
    column per item), in the live codebook's order;
  - `coders.csv`: a row per coder with their coder-level answers, how
    their session ended and units finished per loop;
  - `units.csv`: the unit versions answers were given on (`architecture.md`
    §8.4), with the fields as shown;
  - `variables.csv`: per codebook version, question and option, its label;
  - `README.txt`: what the columns mean.

  Answers are stored values; "Add label columns" (on by default) puts a
  `_label` column after each answer column with options: the label in the
  codebook version the answer was given under (what the coder saw), else
  the live one. Several answers are joined with "; ", spans written as
  "value: text", skipped questions empty. UTF-8 with a byte order mark,
  so spreadsheet programs read it. Large jobs would be better served by a
  streaming download from the server (later).
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

- Admin UI: no notice that someone else is editing the same codebook (a
  conflict shows only when saving); codebook errors are shown as raw
  messages, not per field.
- Spans: no re-editing mode (`editMode` in the schema is unused); no
  "click a span to pick it" for relations; no per-field inline styling
  directives; no image-region annotation.
- Tests are render smoke tests plus logic tests. No jsdom interaction tests
  or browser e2e suite in CI yet (browser checks so far are manual
  Playwright runs).
- No visual/UX parity pass against the old app was done.
- Swipe could become `layout: "swipe"` of `nominal` instead of its own
  type (`annotinder`).
- Not built (no case yet): numeric batteries (a thermometer per party),
  scale-level helpers (sum, mean; advanced scripts can compute them from
  `$var.q.values`), translated labels.
