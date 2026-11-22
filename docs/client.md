# Client

How the web client (`packages/client`) works and why. Server side:
`architecture.md` and `coder-identity.md`; the APIs: `docs/api/`.

## 1. Packaging

`src/App.tsx` holds the routes (TanStack Router; query values stay strings):

| URL                                | Page                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                | Welcome page (`pages/WelcomePage.tsx`)                                                                                                                |
| `/research`                        | The researcher UI: the studies                                                                                                                        |
| `/research/studies/<id>/<tab>`     | A study (`overview`, `editor`, `units`, `links`, `coders`, `results`, `settings`, `preview`); the editor takes `?version=<n>`                         |
| `/research/admin`                  | The server admin page                                                                                                                                 |
| `/code`                            | The coder home: studies on this device (`pages/CodeHomePage.tsx`)                                                                                     |
| `/code/<deployment>?link=<secret>` | Coding (`pages/CodePage.tsx`), plus the link's URL parameters; `?transfer=<token>` continues on another device; without either, this device's session |

- A reload stays where it was. The researcher section is one `AdminApp`
  whose place comes from the URL (`AdminLocation`). Leaving the editor with
  unsaved edits asks first (`useLeaveGuard`, also on reload or closing the
  tab).
- **Components, not routes.** `StudyRunner` (coding) and `AdminApp` have no
  router dependency (`AdminApp` gets its place and navigation as props, and
  brings its own `QueryClientProvider` unless given one), so another React
  app (e.g. AmCAT) could embed them.
- **One origin.** Coder and researcher sessions are httpOnly cookies, so the
  client is always served from the server's origin (`docs/hosting.md`); in
  development Vite proxies `/api`. Only scripts with API keys call the server
  from elsewhere.

## 2. StudyManager (coding runtime)

`src/lib/studyManager/StudyManager.ts` is a framework-agnostic state machine;
`useStudyManager` binds it to React with `useSyncExternalStore`. It talks only
to the `CoderApi` interface (`api/httpCoderApi.ts`); tests use stubs.

Its parts, in `studyManager/`: `outbox.ts` (background saving), `unitDraft.ts`
(the open unit's answers in localStorage), `items.ts` (codebook lookups),
`practice.ts`, `navigationLabels.ts`, `errors.ts` and `types.ts` (the
snapshot the screen reads). The screen is `components/StudyRunner.tsx`, with
its parts in `components/studyRunner/`: the top bar, the question panel,
settings and transfer menus, and the loading, error and pick-a-name screens
(`SessionNotices.tsx`).

- **Steps.** It computes the visible steps from the codebook: top-level
  items, then loop questions, with conditions (of blocks, which show
  their children or else their `elseChildren`, and of loops: a loop whose
  condition fails is left out) evaluated in document
  order (§5). Answers of questions a condition now hides count as unanswered, and
  are posted as `skip`.
- **Rendering inputs.** It renders the unit layout and the current question's
  texts ahead (`currentUnitTemplate`, `currentTexts`), because evaluation is
  async and rendering isn't. `currentUnitVariables` gives the current unit's
  answers so far (relation questions need sibling spans).
- **Computed variables** without a value are invisible steps: save the
  answers so far, then ask the server (`computeVariable`).
- **Units in batches** of 5 (`UNIT_BATCH`), a queue per loop refilled in the
  background when 2 are left.
- **Saving in the background.** Answers go into an outbox, posted one at a
  time in order; a newer post for the same answers replaces one still
  waiting (`Outbox`). Connection failures (network, 5xx, 408, 429) are retried, backing
  off up to 30 s; other failures stop saving and show an error. The outbox is
  emptied before `/end` and `/quit`. `StudyRunner` shows "Not saved yet: no
  connection" and asks before the page closes with unsaved answers.
- **Frozen answers.** Coder-level answers a loop depends on are read-only
  once a unit in that loop is saved (`session.frozen`).
- **Response times.** `QuestionTimer` (`studyManager/timing.ts`) times each
  question; timings go with the posts (`coder-identity.md` §10).
- **Endings.** A reached `end` item is the last step: it tells the server and
  shows the ending (§4 "End items"). Reaching the end without one also calls
  `POST /end`.
- **A new design version while coding.** The server answers 409
  `codebook_changed` to requests under the old version. `StudyManager` then
  reloads the session and returns to the unit the coder had open; unsaved unit
  answers are kept as far as they fit, coder-level ones asked again.
- `start()` is idempotent (React StrictMode); `retry()` re-runs the last
  failed operation (safe: writes are upserts).

**Navigation.** Back, forward, and jumps to a phase, unit or question. Unit
history is kept per loop and rebuilt on resume from the finished unit ids
(`architecture.md` §8.1). Rules (tested in `studyManager/navigation.test.ts`
against `fakeCoderServer.ts`):

- Back from a unit's first question goes to the previous unit's last
  question; from the loop's first unit, to the step before the loop. Back
  never lands on an `end` item; a loop without units is passed.
- Moving forward into a loop opens the unit the coder started and didn't
  finish, else the next unit from the server. A unit is never handed out
  twice.
- Jumping to a loop returns to the unit the coder was on. Going back after an
  `end` inside a loop (`reopen`) opens that unit at its last question.
- Operations run **one at a time**, in order; an answer to a question no
  longer on screen is dropped. `StudyRunner` also drops double clicks in the
  answer area and auto-repeated answer keys (`components/inputGuards.ts`).

## 3. Unit layout and texts

A unit's layout is **one markdown template** (`UnitLayoutSchema`:
`template`, `snippets?`, `style?`). Question and instruction texts are
templates with the same syntax. Rendering uses `react-markdown` +
`remark-gfm` (`components/TemplateMarkdown.tsx`). Raw HTML is not supported,
so templates are XSS-safe by construction.

A template is read in two steps: first the **text is put together**
(snippets pasted in, blocks chosen), then the **values are filled in**.

**Values**: `$unit.<field>`, `$var.<q>.label` (see "References and
conditions", §5) or `{{ js }}`. A suffix says how to show the value; it goes
after the slot, never inside `{{ }}`:

| Suffix             | Shows                                                          |
| ------------------ | -------------------------------------------------------------- |
| `::text` (default) | literal text, never parsed as markdown (`**x**` stays `**x**`) |
| `::markdown`       | rendered markdown (no blocks or values inside)                 |
| `::image`          | an image from the URL                                          |
| `::html`           | HTML in a sandboxed iframe (below)                             |

`$unit.text` equals `{{$unit.text}}`. `\$` is a literal `$`; references in
code spans stay literal. Values become text predictably: strings as is,
numbers via `String`, arrays joined with `", "`, `null` as nothing, objects
as JSON.

**`::html`** (`components/SandboxedHtml.tsx`): for prepared material (a
table, a formatted article), also from unit data. The frame has
`sandbox="allow-scripts"` without `allow-same-origin` (an opaque origin: no
access to the app, storage or cookies; no forms, popups or navigation) and a
CSP that allows no requests (images and fonts only as `data:`) and no script
but ours, which reports the content height. A default style copied from the
app (colours, font size, light or dark) makes plain HTML fit in; the HTML's
own CSS overrides it.

**Typed blocks**: `::: text|markdown|html|image [name]` … `:::` show their
content (values inserted as they are) as one thing of that kind. A suffix is
the short form of a typed block. Typed blocks don't nest.

**Names** (`templateNames`): a unit field's value is `unit.<field>`, an
answer `var.<question>`, a typed block its own name. These are the layout's
**ids**, marked as `data-field="<id>"`.

**Focus**: a question's `focus` ("Focus on") lists ids it is about (a span
question defaults to its fields). They are marked, the first scrolls into
view and flashes; with `focusDim` the other top-level parts fade.

**Selectable text**: a span question's `fields` are unit fields the layout
shows as plain `$unit.x` (or in a named `::: text` block). Only unit fields,
so span offsets always point into a stored string. Every such field is
rendered as `SelectableText` during the whole unit, so the layout doesn't
shift; only the span question on screen can select. Each span stores its
field.

**Blocks** (contracts `templateBlocks.ts`): lines starting with `:::`, like
Pandoc's fenced divs.

```
::: if $var.group.is('experiment')      :::: from topics
[[experiment_banner]]                  ::: style font-size: 90%
::: else if [[other_condition]]         You rated it $var.sentiment.label
...                                     :::
::: else                                ::::
[[control_banner]]
:::
```

- `if` / `else if` / `else`: the first branch whose condition holds (the
  same scripts as blocks' conditions).
- `from <question>`: shows from that question of the loop on; consecutive
  `from` fences form a chain of which the last reached stage shows. Loops
  only.
- `style <css>`: the content in a `<div>` with inline CSS (per property;
  `position: fixed/sticky` refused).
- `text|markdown|html|image [name]`: typed blocks (above).
- A bare `:::` closes the innermost block and needs as many colons as its
  opening fence, so outer blocks use more colons.

**Snippets** (`layout.snippets`, contracts `snippets.ts`): named pieces of a
loop's template, written `[[name]]` and pasted in as text before anything
else, anywhere: a line, a fence (`::: if [[condition]]`), inside `{{ }}`.
Snippets can use snippets (not themselves). They work in the layout and the
loop's question texts. Names must be literal.

`$unit` and snippets exist only inside a unit loop.

**How it renders** (`codebook/renderTemplate.ts`, `templateValues.ts`): a
pre-pass (`parseTemplate`) replaces each value with a private-use
placeholder (on its own line: its own block). `StudyManager` evaluates values
and conditions (cached, §6). A remark plugin turns placeholders into
`<template-value>` elements: a text node, nested markdown, an `<img>` or
`SelectableText`. (Not `remark-directive`: it misreads text like `10:30`.)

## 4. Questions and answers

### Options: a value and a label

Every option is `{ value, label?, color? }` (`design/options.ts`), as SPSS or
Stata value labels:

- **The value** is stored, compared and exported, unique per question.
  Changing one in a deployed design changes what earlier answers mean; the
  deploy dialog warns.
- **The label** is what coders see (default: the value); it can change freely.
- **The measurement level decides the value type.** Nominal: trimmed,
  non-empty strings (the editor derives them from the label until edited).
  Ordinal and scales: numbers rising in option order (default 1..n).
  Switching between them converts (`convertOptionsLevel`).

### Types

| Type         | What                                                             | Stored (`VariableValue`)                   |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------ |
| `nominal`    | pick from categories; `multiple` for several                     | `values: [{ value }]`                      |
| `ordinal`    | pick from ordered options                                        | `values: [{ value }]`                      |
| `numeric`    | a number; `min`, `max`, `step` (default 1), break-point `labels` | `values: [{ value }]`                      |
| `scale`      | `items` rated on the same ordinal `options` (a Likert battery)   | `values: [{ item, value }]`                |
| `annotinder` | swipe a card: 2 or 3 options (left, right, up)                   | `values: [{ value }]`                      |
| `confirm`    | a button                                                         | nothing besides `done`                     |
| `span`       | select text in the unit (loops only)                             | `spans: [{ id, field, value, slices }]`    |
| `relation`   | link two spans (loops only)                                      | `relations: [{ id, fromId, toId, value }]` |

Answers hold values, never labels. `validateAnswer` checks them against the
current design (option values, one per scale item, at most one unless
`multiple`, numbers within range and on the `step` grid).

### Layout: fixed and compact

`layout: "auto"` (default) is fixed per question, not per device, so every
coder sees the same form. `resolveLayout` (`design/answerLayout.ts`) picks it
for the smallest phones (~360 px) within half the screen height; the editor
shows what it picks and warns when a chosen layout doesn't fit.

- Nominal and ordinal: `row`, `grid` (`columns`), `flex` (nominal), `compact`
  (ordinal: buttons show values, the selected one its label), `dropdown`.
  Auto nominal: a row for 2-3 short labels, a dropdown from 10 options,
  else 2 columns, 1 column, a dropdown. Auto ordinal: a row for 2-3, else 1 column, else compact.
- Numeric: `buttons` (up to 11 in a row, more in even rows; auto up to 6
  values), `slider` (← → Home End, Shift + Enter), `input` (open ranges).
- Scale: `compact` (a row per item, default) or `grid`. Continue scrolls to
  the first unanswered item.

Number keys 1-9 pick an option; one answer is given on the first click,
several are confirmed with Continue.

**Swiping** (`annotinder`, `components/SwipeCard.tsx`): in a loop the unit is
the card (framed only with `card: true`). The coder drags anywhere on the
coding area; past 30% of the width (120 px up), or flung, the card flies off
and that option is the answer. Direction buttons, arrow keys and 1, 2, 3 work
too. Vertical drags still scroll long units (`touch-action: pan-y`).

### Span and relation answers

- Span and relation questions are ordinary steps. `StudyRunner` mounts a
  `SpanAnnotationProvider` per unit; only the active span question's fields
  can select (§3, "Selectable text").
- Spans are stored as character offsets plus the selected text and the
  field. Word mode snaps to words; character mode takes the exact selection.
- Spans may overlap. Clicking a span opens its labels; Backspace or Delete
  removes the last span.
- Relations link two spans of earlier span questions of the loop, with one
  of the relation's options, as its `rules` allow (contracts
  `relations.ts`; the server checks them on submit). During a relation
  question `StudyRunner` adds a `RelationAnnotationProvider`; the selectable
  text shows the rules' spans as buttons (`RelationText`): click a start,
  then a destination; with several possible types the answer field asks.
  `RelationArrows` draws the relations as arcs in an SVG inside the unit's
  content, positioned against it: it scrolls with the text, and is measured
  again only when the relations change or the content resizes.

### End items

An `end` item ends the session when reached, usually inside a block with a condition (not at the top level):
`outcome` `screenout` or `complete`, an optional `message` (a template) and
`redirectUrl` (e.g. a panel's return link; `$var` values URL-encoded).
`StudyManager` calls `POST /end` (in a loop after saving the unit) and shows
the ending (`SessionEnd.tsx`, redirecting after a few seconds). Afterwards
the session refuses units and answers (409 `session_ended`) and a reload
shows the ending (`coder-identity.md` §9).

### Questions and instructions

- **Question text** (`variable.question`) is a markdown template. A short
  one-paragraph question (at most 150 characters, `components/questionHeading.ts`)
  shows as a heading.
- **Instructions**: `instruction` (a template: how to apply the question to
  units) and `instructionOpen` (`first` | `practice`) belong to questions in
  a unit loop; questions outside a loop refuse them (put details in the question
  text). A ? button by the question, or the ? key, opens the instruction in
  a dialog (`components/QuestionInstruction.tsx`), with a dot until opened
  once. With `instructionOpen` it opens by itself on the first unit with the
  question, or on practice units (`StudyManager.opensInstruction`).

### Display

The Study entry's `display` (`{ layouts?: "fixed" | "responsive", theme?:
"coder" | "light" | "dark" }`) reaches coders in the codebook. The coding
screen provides it (`display/context.ts`) with the coding area's width class
(narrow below 600 px; the area, not the window).

- `layouts: fixed` (default): the same layout for every coder.
  `responsive`: auto layouts also follow width and keys (up to 5 buttons in a
  row or 3 columns when wide, 3-column grids with the numpad, buttons instead
  of a dropdown when typing to filter). Layouts a researcher chose are kept.
- The numpad mapping is only available in responsive designs.
- `theme: light | dark` overrides the coder's choice (the switch is hidden).
- Each coder's display (keys, width class, theme) is recorded when it starts
  and changes (`POST /display`, up to 100 entries in
  `coder_sessions.display`), in the results as a `display` column and
  `display_changes.csv`.

### Keyboard

One key listener (`keyboard/KeyboardProvider.tsx`) and a `KeyController`
whose scopes get key presses in turn: menus (exclusive) over span editors
over answer fields over the base layer. Text fields, modifiers and held keys
are handled there once.

- Answer fields declare their choices (`useKeyTargets`: groups of targets; a
  scale has a group per item) and get each target's key for its badge.
- A `KeyMapping` (`keyboard/mappings.ts`) decides which key picks which
  target: numbers (default), numpad (by position, up to 3 x 3), letters (home
  row first) or type to filter. Where a mapping can't map a group, numbers do.
  The coder's choice is stored in the browser.
- The base layer: arrows move focus by screen position, Space/Enter click
  the focused button, Shift + Left/Right go to the previous/next question
  (back focuses its answer), Shift + Enter continues an answered question.

### Study entry

The design's `session` item (always first, never shown to coders) holds the
coder unit assignment (`architecture.md` §6.1), the URL parameters (§7), the
normal end and the display. The server reads them when a session starts; the
client sees only the values, as `$session.<name>`.

In the editor it isn't a tree item: above the tree, `SessionHeader.tsx` edits
the public title and has a button per part (**Coder unit assignments**, **URL
parameters**, **Display**) that opens that part alone (`SessionItemForm.tsx`,
the open part in `session/sessionTab.ts`); its JSON is that part only
(`SessionPartJson.tsx`) and its preview shows what it means for coders
(`SessionPreview.tsx`: the links, what a link must carry, the screen). The
coders form selects the coder distribution column and how coders get in;
"Create new coder distribution…" / "Create or update coder distribution…"
(`session/CoderSetDialog.tsx`) makes or replaces the column, after asking
(names, email addresses or a number of coders; coders per unit or
everyone codes everything; the column name; overlap units, and optionally
practice and gold units). It keeps the units coders were already shown or
answered with them by default (`GET /coders/units`, contracts
`distributeUnits`). The crowd form has the coder id URL parameter, "Coders
sign in", an optional set column for special units ("Create special units…"
makes one with the same dialog: special units only; other sets give a link
per set), and "Max. nr of coders" (per link, and per set with a link per
set). **At the end**, a button below the tree, edits the normal end
(`session.end`).

## 5. Scripting sandbox: QuickJS

Script conditions and `{{ }}` values are JavaScript expressions run in
**QuickJS** (`quickjs-emscripten-core`, single sync variant). In scope: only
`$unit`, `$var` and `$session`. Each evaluation has a 100 ms deadline and a 1
MB memory limit. A script that is a single reference skips QuickJS. A failing
script counts as false (conditions) or empty (templates).

Why not CEL: thin bindings outside Go, none for R. JavaScript is widely
known, R runs it via `V8`, and plain JS keeps designs reproducible. Simple
conditions don't need an engine at all.

All conditions run in the client; the server never needs those answers to
hand out units.

### References and conditions

One reference syntax everywhere: scripts, templates, texts, conditions,
redirect links (`design/references.ts`).

| Reference                               | Meaning                                                                            | Questions                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| `$unit.<field>`                         | a unit field (inside a loop)                                                       |                                                   |
| `$var.<q>.value`, `.label`              | the answer; `null` when unanswered                                                 | single nominal, ordinal, numeric, swipe, computed |
| `$var.<q>.values`, `.labels`            | the answers; `[]` when unanswered                                                  | nominal `multiple`, span, relation                |
| `$var.<q>.texts`                        | the selected texts                                                                 | span                                              |
| `$var.<q>.values`                       | all items' values, in order                                                        | scale                                             |
| `$var.<q>.items.<item>.value`, `.label` | one item                                                                           | scale                                             |
| `$var.<q>.answered`                     | answered and not skipped                                                           | any                                               |
| `$session.coder`, `.source`, `.<name>`  | the coder id, `?source=`, the declared URL parameters (strings; empty when absent) |                                                   |

`.value` on a multiple-answer question (or `.values` on a single one) is a
validation error. Every question is in `$var`, so scripts never throw on an
unanswered one. Names must be literal (`$var[x]` is an error), so validation
can check every reference.

**Helper methods** are called on a question (or scale item); validation
checks the method and its arguments. All are false (`count()`: 0) while
unanswered.

| Question                          | Methods                                           |
| --------------------------------- | ------------------------------------------------- |
| single (nominal, swipe, computed) | `is(v)`, `isAny(v1, v2, ...)`                     |
| ordinal, scale items              | also `gt`, `gte`, `lt`, `lte`                     |
| nominal `multiple`                | `has(v)`, `hasAny(...)`, `hasAll(...)`, `count()` |
| numeric                           | `eq`, `gt`, `gte`, `lt`, `lte`, `between(a, b)`   |
| span, relation                    | `has(v)`, `count()`                               |

They compare values, never labels; `is(2)` matches the value `"2"`
(`sameValue`). `applyHelper` is the TypeScript implementation,
`HELPER_PRELUDE` the same inside QuickJS (a test checks they agree).

A **condition** (`design/condition.ts`) is a script; truthy = holds:

```yaml
condition:
  script: $var.topics.has("sports") && ($var.edu.gte(3) || !$var.consent.answered)
```

- **Simple**: only helper calls, `.answered`, `true`, `false`, `&&`, `||`,
  `!`, parentheses and `count()` comparisons. Parsed and evaluated in
  TypeScript (`parseSimpleCondition`, `evaluateSimpleCondition`).
- **Advanced**: anything else, run in QuickJS.

A block's condition hides its children when false (absent: always
shown), showing its `elseChildren` instead, if any. A unit loop's condition decides whether the coder gets the loop at
all; it can only use coder-level answers before the loop, not `$unit`.

**Validation** (`validateDesignItems`) walks the design in order and checks
every reference: the question exists and comes earlier (not inside the
condition's own children, not in another loop); the property or method fits
its type; `$unit` and snippets only inside a loop (unknown snippets are
errors, unknown `$unit` fields warnings once the study has units); redirect
URLs only use earlier coder-level `$var` and declared `$session` names; span
fields are shown as plain text. In simple conditions helper arguments must be
option values (numeric: within range). Script syntax is checked in the editor.

## 6. Recomputation and caching

No hand-maintained trigger graph: one recompute pass with per-slot
memoization.

- `codebook/dependencies.ts`: `extractDependencies` reads which references a
  script uses and their current values (exact, since names are literal).
- `codebook/expressionCache.ts`: `ExpressionCache.evaluate(key, script,
scope)` re-runs QuickJS only when the script or one of those values
  changed.
- `StudyManager` owns one cache per session; changing units needs no
  invalidation.

## 7. Admin UI

`components/admin/AdminApp.tsx` is a tabbed shell: Overview, Design, Units,
Deploy (with the deploy history), Links, Results, Settings. It uses a `ResearcherApi`
(`api/httpResearcherApi.ts`).

- **Login**: `account/ResearcherGate.tsx` shows a login screen unless logged
  in (with the previous provider while the server changes providers, and a
  banner asking to link the new login). `account/AccountMenu.tsx`: email (an
  orange shield when the login had no second factor), API keys, theme, log
  out. On a development server, development headers replace the login.
- **Accounts**: only researchers create studies; `account/ResearcherAccess.tsx`
  handles requests to become one. Admins get the server admin page
  (`server/ServerAdmin.tsx`, a tab per file in `server/`: warnings, users,
  plans, registration, studies, log; `docs/accounts.md`).
- **From a file** (`ImportStudyDialog.tsx`): a study export (its manifest is
  read in the browser, then `POST /study/import`, with or without coders) or a
  design file (sent as a recipe, `docs/examples.md`). Export is in the study's
  Settings (`docs/hosting.md` "Moving a study").
- **Guided setup** (`SetupWizard.tsx`, its steps in `setupWizard/`;
  `lib/admin/setupRecipe.ts`): a short
  way to a new study's skeleton. It writes a recipe (`docs/examples.md`) and
  opens the study in the editor; there is no way back into the wizard. Steps:
  1. **What do you want to do?** Name; annotate units, ask questions, or
     experiment.
  2. **The experiment**: a condition's name and values, balanced or random (a
     computed item, first in the design).
  3. **Units**: the CSV upload (or later), and the order.
  4. **Who codes what**: everyone everything (a crowd); sets per coder, each
     with a link (`per_coder`); crowd coding (the loop's `units.divide`, and
     a crowd column `coders` for an overlap or gold/practice checks); or
     experimental groups (a computed item linked to a column).
  5. **How coders see a unit**: the layout sketch (`LayoutDesigner.tsx`:
     title, byline, body), with a preview.
  6. **Questions**: names, one per line, before, per unit and after. They get
     the answer type `unspecified`, which must be set in the editor before
     previewing or deploying.
  7. **Check and create**: a summary; the design is created as a draft.
     The questions before and after the loop go at the top level.
- **Tree** (`DesignTreeView.tsx`, `designTree/`): the top level holds
  questions, computed items, `block`s and unit loops; validation refuses an
  end item there ("An end item goes in a block") and a loop inside a block.
  A block has an optional `label`, `condition`, `children` and
  `elseChildren` (only with a condition). The coder-level items before,
  between and after loops are grouped in a lightly tinted card (only in the
  tree); each loop is its own card; a block has a coloured bar on its left
  and lines up with the items around it. A block's row shows its label
  and/or "if <condition>", else "Block"; questions aren't numbered. With a
  condition it has an "Add else items" button, which adds an "Else" part
  with a first question; the Else part shows under the block's items only
  when it has items. "Add item" adds a question, computed variable, block
  ("Block (if/else)", starting empty) or unit loop; a row's + adds items
  allowed there (`insertableTypesAt`): in a block question, computed
  variable, block, end; in a loop question, block, end. Above the tree the
  Study entry (§4), below it the **At the end** button, styled like the
  Study entry's buttons.
- **Design editor**: edits the whole design in memory, validated with
  `validateDesignItems`, saved as a whole.
  - **Visual**: the tree, and the selected item as a form, as JSON
    (`ItemJsonEditor.tsx`) or as a preview (`ItemPreview.tsx`: a loop with the
    study's units, a picker for the question on screen, answer pickers for
    `::: if`). On screens at least 1500 px wide the preview is a third column.
    Blocks and loops have no name; loops show their label or
    "Unit loop". Moving and deleting work on ticked items from the toolbar; where a
    place is ambiguous (the end of a container) the menu asks where.
  - **JSON**: the whole design (`DesignJsonEditor.tsx`), in Monaco (loaded
    with the editor) with completion and checks from the design's JSON Schema
    (`designJsonSchema`). JSON, not YAML: no indentation to get right.
  - Both JSON views apply an edit once it parses to items the tree can show;
    until then "Not applied" says why.

  Saving and safety:
  - **Save** works with issues (work in progress); previewing and deploying
    need a valid design. The toolbar counts errors and warnings.
  - A save carries its base `revision`; if someone saved meanwhile, a dialog
    offers "Save mine over theirs" or "Discard mine, load theirs".
  - **Undo/redo**: the last 100 steps (edits less than a second apart are one
    step).
  - Items with unsaved changes have a dot; **Revert** reverts one item or all.
  - A draft is deleted only from the versions dialog.
  - **Backup**: unsaved edits are copied to localStorage a second after each
    change, and offered back after the browser was closed.

- **Unit loops** have two tabs (`UnitLoopForm.tsx`). **Units**
  (`unitLoop/UnitsEditor.tsx`): what a coder gets, the previous loop's units
  (`sameAsPrevious`), the subset, for a crowd "Units and coders" (everyone codes
  everything, or divide the units: the distribution criteria), the coding
  units and the assignment column's overlap/practice/gold with placement,
  the checks, and the order (`architecture.md` §6.2). **Layout**: the template in Monaco
  (`jsonEditor/MonacoTemplate.tsx`) with highlighting and completions after
  `$`, `[[`, `::` and `:::`, and the snippets. A code lens above each
  `::: if` shows the condition in words and opens the rules editor. An Insert
  menu (`TemplateInsertMenu.tsx`) writes fields, snippets, "Show if…", "Show
  from…", styles and an HTML block. The layout's `style` is only in the JSON
  views.
- **Help** (`lib/help/`): one markdown file per topic in `help/topics/`
  (front matter `title`, `section`, `order`, `summary`), shown in one
  `HelpDialog`; `openHelp("topic#heading")` opens it. Code blocks in the
  language `example` are live, editable template examples. A test checks
  front matter, links, the topics the UI opens, and every example.
- **Versions and deploying** (`design/versions.ts`): _live_ is the deployed
  version (frozen), _draft_ the latest if not frozen, _history_ the rest
  (read only, restorable as the draft). Editing the live version saves a new
  draft. The editor only saves; **Deploy** (`DeployPage.tsx`,
  `DeployPanel.tsx`; `PUT /deployment`) deploys the saved draft and the draft
  units and sets: it lists changes against the live version (`design/diff.ts`), takes a version note, and shows
  the server's errors and warnings (reopened units, removed option values,
  changed types). Below, it lists every deploy with its design version's note
  (`DeployHistory.tsx`). Coders switch to the new version on their next
  request (§2).
- **Question forms** (`VariableTypeForm.tsx` picks the form per type in
  `variableType/`; `ItemForm.tsx`, with end items and loop-question fields in
  `itemForm/`): the options editor
  (`OptionsEditor.tsx`: label, value, colour, order; ordinal values renumber
  unless "Custom values"), `multiple`, a layout select whose `auto` entry
  names its choice, numeric range, step and labels. Switching nominal ↔
  ordinal keeps the options. A block's or loop's condition
  ("Only show these questions if…", "Only give coders this loop if…") uses
  `ConditionEditor.tsx`:
  **Rules | Script** over the same script. Rules are a flat list joined by
  all "and" or all "or" (`design/conditionRules.ts`); a row that no longer
  fits its question stays and says why. Other scripts open in script mode with
  a cheat sheet and a syntax check.
- **Units** (`units/`): CSV upload (`UploadUnits.tsx`, own parser
  `admin/csv.ts`): pick the id column, which columns to upload as which field,
  and their types (inferred and checked), or type **set** for a set column.
  A paged table of units; pick a column value to see its units in order;
  "Fill a set column" (`SplitIntoSets.tsx`); put selected units in a value,
  remove them, or reset their answers. A coded unit is replaced only by
  uploading it again, after a warning.
- **Overview** (`overview/`): live/paused/unpublished, live and draft
  versions, counts, set columns, answers per day, progress per loop;
  pausing and resuming (`LiveControls.tsx`) is on the Deploy page.
- **Settings** (`StudySettingsPage`): the team (`TeamSettings.tsx`, at least
  one ADMIN), rename, archive, keep sessions open, export, delete.
- **Links** (`LinksPanel.tsx`, `links/`): the links deploying made, with their
  label, coder or set, uses (of the design's maximum), status and the URL
  parameters they take (copied with placeholders). Per link: revoke,
  reopen, new secret; no settings of their own.
  Retired links are listed apart. There is no "create": the Study entry
  declares the invitation.
- **Coders** (Results › Coders; `CodersPanel.tsx`, deletion in `coders/`): per coder session the link, started, last active, answers,
  finished units per loop, and how it ended. Deletion requests come first.
  Reset or delete data per session, or by coder ids or emails
  (`coder-identity.md` §8).
- **Results** (`results/`, opens on Questions; the open view in
  `results/resultsView.ts`): **Questions**, **Agreement**, **Units** (by
  disagreement; one unit through the loop's layout with every coder's
  answers) and **Coders** (the sessions above, then time per unit, practice
  tries, kappa) show the
  answers so far from the server's summaries (`getResultsAnswers`,
  `getResultsAgreement`, `listResultUnits`, `getResultUnit`,
  `listResultCoders`), loaded once and on Refresh. **Download**
  (`results/DownloadView.tsx`; `admin/exportData.ts` with the tables,
  `exportAnswers.ts` for answer cells, `exportReadme.ts`): one zip, as plain
  CSV files (default) or one `results.xlsx` (`admin/xlsx.ts`, a sheet per
  table, text as inline strings so never a formula), built in the browser,
  with `fflate`, from the server's raw export
  (`exportResults`, read by `admin/rawExport.ts`); **Raw export** saves that
  export as is:
  - `annotations.csv`: a row per unit and coder session (unit version, design
    version), a column per question (scales a column per item);
  - `coders.csv`: coder-level answers, how the session ended, units finished;
  - `units.csv`: the unit versions answered (`architecture.md` §8.4);
  - `variables.csv`: labels per design version, question and option;
  - `devices.csv`, `timings.csv`, `deleted_coders.csv` (`coder-identity.md`
    §4, §10, §8), `display_changes.csv`, `README.txt`, optionally
    `reset_answers.csv`.

  Cells hold values; "Add label columns" (default on) adds `_label` columns
  (the label the coder saw). Several answers are joined with "; ", spans as
  "value: text", relations as "value: from → to". Answers that don't fit a
  cell also get a `_json` column. CSV is UTF-8, written as it is.

- **Preview** runs the latest design as deployment `<studyId>.preview`
  (`POST /study/:studyId/deployment/preview`); nothing is stored
  (`architecture.md` §5).

## 8. Tooling notes

- Node ≥ 22. The server uses PGlite in tests and development.
- Vitest configs exclude `**/dist/**` (else built tests run twice).
- Tailwind 4 (CSS-first `@theme`); `tw-animate-css` imported without
  `layer(base)`.
- TypeScript 7 waits for typescript-eslint support.
- Keep dependencies minimal (e.g. no CSV library).

## 9. Known gaps

- No notice that someone else is editing the same design (a conflict shows
  only on save).
- Spans: no image regions. Relations: no relations between relations; no
  agreement measure for them yet.
- Swipe could become `layout: "swipe"` of `nominal`.
- Not built: numeric batteries, scale helpers (sum, mean), translated labels.
