# Client

How the web client (`packages/client`) works and why. Server side:
`architecture.md` and `coder-identity.md`; the APIs: `docs/api/`.

## 1. Packaging

`src/App.tsx` holds the routes (TanStack Router; query values stay strings):

| URL                                | Page                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                | Welcome page (`pages/WelcomePage.tsx`)                                                                                                                |
| `/research`                        | The researcher UI: the studies                                                                                                                        |
| `/research/studies/<id>/<page>`    | A study's page (`overview`, `design`, `units`, `deploy`, `links`, `results`, `settings`, `preview`); `design` takes `?version=<n>`                    |
| `/research/admin`                  | The server admin page                                                                                                                                 |
| `/about`                           | About this server: who runs it, where it is hosted, contact, privacy statement, terms and version, as its operator set them (`pages/AboutPage.tsx`, `GET /api/info`); linked under the start page and the coder home |
| `/code`                            | The coder home: studies on this device, and a logged-in coder's sessions on other devices (`pages/CodeHomePage.tsx`); those open with `?login=1` (`session/studies.ts`, `continueUrl`) |
| `/code/<deployment>?link=<secret>` | Coding (`pages/CodePage.tsx`; `<deployment>` is the study's public id), plus the link's URL parameters; `?transfer=<token>` continues on another device; without either, this device's session. `?login=1`: the coder chose to code with their account; read once, then taken out of the URL, like `transfer` (`useLoginChoice`; the API then sends `x-use-login: 1`, `coder-identity.md` §5) |

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

`src/lib/studyManager/StudyManager.ts` is a framework-agnostic state machine,
split into the modules below;
`useStudyManager` binds it to React with `useSyncExternalStore`. It talks only
to the `CoderApi` interface (`api/httpCoderApi.ts`); tests use stubs.

`StudyManager` is the facade: the screen talks to it, and it keeps the
session together. What it works with is in the other files of
`studyManager/`:

| File | What it holds |
| --- | --- |
| `Position.ts` | Where the coder is: the top-level steps, the open loop and unit (`OpenUnit`), how far they got (Next stops there), and the saved position |
| `UnitHistory.ts` | Per unit loop, the units seen in this session (and, after a resume, those finished earlier) with their answers |
| `UnitQueue.ts` | Per unit loop, the units fetched ahead (in batches) and not shown yet |
| `Operations.ts` | The operations that talk to the server (answering, navigating) run one at a time, in order; a failure puts the coder back and says what Retry repeats |
| `practice.ts` | Checks of practice answers against their key, and tries per question |
| `stepRenderer.ts` | Pure: renders a step's unit layout, question texts and practice feedback |
| `endings.ts` | Renders the end item's message and redirect |
| `navigationSnapshot.ts` | Pure: the navigation (loops, questions reached) the screen shows |
| `sessionDesign.ts` | The design the session codes with (the coder codebook) and its lookups |
| `instructionOpening.ts` | Which instructions open by themselves, for one visit |
| `snapshots.ts` | The empty snapshots (`NO_STEP`, `INITIAL_SNAPSHOT`) |
| `outbox.ts` | Background saving, and the finished units kept in the browser |
| `unitDraft.ts` | Unfinished units' answers, kept in the browser |
| `items.ts`, `navigationLabels.ts` | Codebook lookups; labels for the navigation |
| `errors.ts` | Which failures are tried again |
| `types.ts` | The snapshot the screen reads |

**The screen** is `components/StudyRunner.tsx`: only the providers (the
coder's settings, the keyboard) around `CoderSessionGate`. Its parts are in
`components/studyRunner/`, one component per file:

| File | What |
| --- | --- |
| `CoderSessionGate.tsx` | Before coding: redeems a transfer link, starts a new session on request |
| `CodingScreen.tsx` | One session: hooks, then a switch on the snapshot's phase: loading, error, finished, or the question |
| `QuestionScreen.tsx` | The top bar, the connection notice, the new-units banner, and the question: `UnitQuestionLayout` in a unit loop, `CoderQuestionCard` outside one |
| `UnitQuestionLayout.tsx` | The unit scrolling above, the question docked below. `UnitAnnotations` (spans and relations) is mounted once per unit, so the unit stays as it is (its frames, how far it is scrolled) from question to question |
| `AnsweredQuestion.tsx`, `QuestionPanel.tsx`, `SwipeArea.tsx` | The question with the coder's earlier answer, practice feedback or a frozen answer's Continue, and the swipe |
| `CodingTopBar.tsx`, `KeyboardMenu.tsx`, `CoderSettingsMenu.tsx`, `TransferMenu.tsx` | The top bar and its menus |
| `SignInNotes.tsx` | Signing in, as the session says it stands (`signIn`, `canLogIn`; `coder-identity.md` §5): what "Continue on another device" says under its transfer link (`SignInNotes`: "Sign in to continue from any device. The researchers don't see your email address." with **Log in** where the coder may; where sign-in is required, to sign in on the other device), and the one line a device shows that joined by a transfer link while its browser isn't logged in (`SignInHereLine`: "Sign in here too to use your saved settings", only where signing in is possible) |
| `ConnectionNotices.tsx`, `NewUnitsBanner.tsx`, `PracticeCorrectFlash.tsx` | What shows over or under the top bar |
| `SessionNotices.tsx`, `SessionNotice.tsx`, `CoderElsewhere.tsx`, `PickName.tsx` | What shows instead of a question: a notice per server error code, else the message with Retry. "You already started on another device" offers **Log in** only where the server says the coder may (`canLogIn` of 409 `coder_has_session`) |
| `hooks.ts`, `useCurrentQuestion.ts`, `useUnitSlide.ts`, `practiceFeedback.ts` | The screen's hooks (display, leave warning, document title, slide direction) |

`useStudyManager` starts the manager when the screen mounts and calls
`dispose()` when it unmounts.

- **Steps.** It computes the visible steps from the codebook: top-level
  items, then loop questions, with conditions (of branches, which show
  their children or else their `elseChildren`, and of loops: a loop whose
  condition fails is left out) evaluated in document
  order (§5). Answers of questions a condition now hides count as unanswered, and
  are posted as `skip`.
- **Rendering inputs.** It renders the step's unit layout (none before the
  loop's first layout item, §3) and the current question's
  texts ahead (`currentUnitTemplate`, `currentTexts`), because evaluation is
  async and rendering isn't. `currentUnitVariables` gives the current unit's
  answers so far (relation questions need sibling spans).
- **Experiments** without a condition are invisible steps: save the
  answers so far, then ask the server (`assignCondition`).
- **Units in batches** of 5 (`UNIT_BATCH`), a queue per loop refilled in the
  background when 2 are left.
- **Saving in the background.** Answers go into an outbox, posted one at a
  time in order; a newer post for the same answers replaces one still
  waiting, but not the one being sent (`Outbox`). The outbox is emptied
  before `/end` and `/quit`, and before an experiment's condition is asked.
- **Retrying a save.** A failure that may go away by itself is tried again
  without the coder doing anything: a network error, a 5xx, 408 or 429
  (`isTransient`, `errors.ts`), after 1 s, 2 s, 4 s, … up to 30 s. Any other
  failure stops saving (`outbox.error`) and shows the error screen; nothing
  more is sent until `retry()` clears it. A `design_changed` failure loads
  the session again instead (below).
- **Connection notices** (`ConnectionNotices.tsx`), while a save is being
  tried again (`snapshot.retrying`): the top bar shows a cloud icon with
  "Not saved yet: no connection", or "3 units not saved yet: no connection"
  when finished units wait (`snapshot.unsavedUnits`); under the top bar a
  line says "Waiting for the connection… Your answers are kept, and saved as
  soon as it is back. The study ends only once they are saved." The coder
  can go on answering; only the end of the study and an experiment's
  condition wait. The quit dialog says the same. Leaving the page with
  unsaved answers asks first (`useLeaveWarning`).
- **Unsent units** (`UnsentUnits`, `outbox.ts`). The finished units still in
  the outbox are also kept in localStorage, under
  `annotinder:unsent-units:<session id>`, written whenever the outbox
  changes. A coder on a bad connection whose tab is closed or discarded (a
  phone) doesn't lose them: the next `start()` posts them before it reads
  the session (posting a unit twice stores the same), then loads the session
  again, since it now has other finished units. One the server no longer
  takes (a new design version) comes again with its answers, as far as they
  fit.
- **Drafts per unit** (`UnitDraftStore`, `unitDraft.ts`). The answers to a
  unit the coder started and didn't finish are kept in localStorage as they
  are given, under `annotinder:unit-drafts:<session id>`: one object, with
  an entry per unit (`<loop id>/<unit id>`), the newest 20. So there is a
  draft for the unit on screen and for each unit the coder went back from,
  and a coder who closes the page mid-unit finds the answers back when the
  unit comes again. A unit's draft is cleared when the unit is saved, all of
  them when the session ends. Not for practice units (a restored answer
  would skip its check), nor for a finished unit the coder went back to
  (its change is saved at once). Both stores are per coder session, and keep
  nothing when storage fails (private mode, full).
- **`dispose()`**: the coding screen is gone. The manager stops timing and
  the outbox stops sending and waiting; what was unsent stays in the browser
  for the next visit. `start()` after `dispose()` goes on with the same
  session (React StrictMode mounts twice).
- **Frozen answers.** Coder-level answers a loop depends on are read-only
  once a unit in that loop is saved (`session.frozen`).
- **Response times.** `QuestionTimer` (`studyManager/timing.ts`) times each
  question; timings go with the posts (`coder-identity.md` §10).
- **Endings.** A reached `end` item is the last step: it tells the server and
  shows the ending (§4 "End items"). Reaching the end without one also calls
  `POST /end`.
- **A new design version while coding.** The server answers 409
  `design_changed` to requests under the old version. `StudyManager` then
  reloads the session and returns to the unit the coder had open. The
  answers to every unit that wasn't saved come back with their units as far
  as they still fit (`carryOver`): units started and not finished, and
  finished units still in the outbox, which are saved again. Unsaved
  coder-level answers are asked again.
- **The error screen and `retry()`.** A failed operation (answering,
  navigating, loading) leaves the coder on the step they were on and shows
  the error with **Retry**. `retry()` shows that step again, then repeats
  what failed: the whole operation, or only the part of it that was still to
  do (`retryFrom`). What it did before is not done again: an answer already
  kept isn't given twice, a unit already queued isn't queued twice, and
  after a failed `/end` Retry ends the session without taking the steps
  again. It also clears a failed save, so saving goes on. Writes are
  upserts, so a repeat that reaches the server twice stores the same.
- **"Go back to the unit".** When the server refuses a finished unit's
  answers (a 400: sending the same again would be refused again), the error
  screen also offers **Go back to the unit** (`snapshot.refusedUnit`,
  `backToRefusedUnit()`). It drops that post from the outbox, opens the unit
  at its first question without an answer that fits, and saves it when the
  coder finishes it again; the posts after it are sent.
- `start()` is idempotent (React StrictMode).

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
  longer on screen is dropped. The screen also drops the second click of a
  double click in the answer area (`components/inputGuards.ts`) and the
  repeats of a held-down key (`keyboard/keyDown.ts`, §4 "Keyboard").

## 3. Unit layout and texts

A unit's layout is **one markdown template** (`UnitLayoutSchema`:
`template`, `snippets?`, `style?`), held by a layout item in the loop (below).
Question and instruction texts are
templates with the same syntax. Rendering uses `react-markdown` +
`remark-gfm` (`components/TemplateMarkdown.tsx`). Raw HTML is not supported,
so templates are XSS-safe by construction.

### Layout items

A layout is an item in the loop's children, not a field of the loop:
`{ "type": "layout", "label"?, "template", "snippets"?, "style"? }`. It shows
the unit for the questions after it, following the flow, until the next
layout item (contracts `layoutItems.ts`):

- **Before any layout item** (or with none) questions show no unit. On
  purpose: a short question at the start of every unit (its text may still
  use `$unit.x`), or units that are only a series of questions.
- **In a branch** a layout item applies only when the branch's items are
  shown; else items get what applied before the branch. After the branch
  either may apply (`followLayouts` gives the candidates, `null` for none).
  E.g. a layout experiment: a default layout, then a branch "if condition = B"
  with layout B, then the shared questions.
- **Snippets** are per layout; question texts, instructions and end messages
  in the loop may use those of all the loop's layouts (`loopSnippets`).
- **Validation** (`layoutsByItem`): a span question's `fields` and a
  question's `focus` must be shown by every layout that may apply; a span
  question with none before it is an error ("no layout comes before it to
  show the unit"). A layout item outside a loop is an error.
- **Runtime**: `computeLoopSteps` (`codebook/tree.ts`) records the layout per
  step; `StudyManager.publishLoopStep` renders that layout, or none.
- **Editor**: a new loop starts with one layout item ("Layout"). The
  preview of a question uses the last layout before it (`previewLayout`), of
  a loop its first; so do "Right answers…" and the Results' unit view.

```json
{
  "type": "unit_loop",
  "id": "loop_1",
  "label": "News items",
  "children": [
    { "type": "layout", "template": "# $unit.headline\n\n$unit.text" },
    {
      "type": "question",
      "name": "read",
      "variable": { "type": "confirm", "question": "Read the article" }
    }
  ]
}
```

### Reading a template

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
  same scripts as branches' conditions).
- `from <question>`: shows from that question of the loop on; consecutive
  `from` fences form a chain of which the last reached stage shows. Loops
  only.
- `style <css>`: the content in a `<div>` with inline CSS (per property;
  `position: fixed/sticky` refused).
- `text|markdown|html|image [name]`: typed blocks (above).
- A bare `:::` closes the innermost block and needs as many colons as its
  opening fence, so outer blocks use more colons.

**Snippets** (a layout item's `snippets`, contracts `snippets.ts`): named
pieces of a layout's template, written `[[name]]` and pasted in as text
before anything else, anywhere: a line, a fence (`::: if [[condition]]`),
inside `{{ }}`. Snippets can use snippets (not themselves). They work in their
layout, and every layout's snippets in the loop's question texts,
instructions and end messages. Names must be literal.

`$unit` and snippets exist only inside a unit loop.

**How it renders** (`codebook/renderTemplate.ts`, `templateValues.ts`): a
pre-pass (`parseTemplate`) replaces each value with a private-use
placeholder (on its own line: its own block). `StudyManager` evaluates values
and conditions (cached, §6). A remark plugin turns placeholders into
`<template-value>` elements: a text node, nested markdown, an `<img>` or
`SelectableText`. (Not `remark-directive`: it misreads text like `10:30`.)

**Highlights** (`highlight: [{ query, color?, fields? }]` on a layout,
`design/highlight.ts`): words to mark. Query syntax, on purpose no more:
spaces are OR, `AND` (capitals) binds tighter, `"phrase"`, `"near words"~n`
(within n words, any order), `*` a wildcard in a word; case and accents
don't count; words are runs of letters and digits. An AND holds when each
side matches somewhere in the searched texts together: the unit fields the
layout shows as text and its named text blocks, or only `fields`.
`codebook/highlights.ts` (`layoutMarks`) turns them into marks per template
value; `TemplateMarkdown` and `SelectableText` draw them (spans keep their
own colours).

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

**Special answers** (`specials`, on nominal, ordinal, numeric and scale
questions): `[{ kind, label?, value? }]`, each kind (`dont_know`,
`not_applicable`) at most once. They aren't options: shown in a row under
the answers (a scale: per item), chosen with / 8 (don't know) and / 9 (not applicable). The answer is `{ special: kind }`, with `value` only if the special
answer has a code (nominal: text; otherwise a number, not an option's value
or, for numbers, inside min..max); without one the value is missing. With
`multiple` it is the only answer. Results count it as a category of its own
for nominal questions and leave it out of ordinal and interval agreement;
the download writes the code (or nothing) with a `.special` column.

**Options from data** (`optionsFrom: { from, at? }` on a nominal question,
`design/optionsFrom.ts`): `$unit.<list field>` (its items: words, or
`{ label, value?, color? }`; values from the labels when not given, made
unique) or `$var.<span question>` (an earlier one in the loop: one option
per span, its text as label, its id as value, its label's colour), in one
fixed row at `at` among the question's own options (default after them).
`resolveVariable` makes the options for a unit: the coding screen
(`StudyRunner`), resumed answers (`currentAnswers`) and the server's checks
(`submitUnit`) use it. A `list` unit field (unitFields.ts) is a JSON list
or words with `;` in a CSV.

### Types

| Type         | What                                                             | Stored (`VariableValue`)                   |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------ |
| `nominal`    | pick from categories; `multiple` for several                     | `values: [{ value }]`                      |
| `ordinal`    | pick from ordered options                                        | `values: [{ value }]`                      |
| `numeric`    | a number; `min`, `max`, `step` (default 1), break-point `labels` | `values: [{ value }]`                      |
| `scale`      | `items` rated on the same ordinal `options` (a Likert battery)   | `values: [{ item, value }]`                |
| `swipe`      | swipe a card: 2 or 3 options (left, right, up)                   | `values: [{ value }]`                      |
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

The shortcut style's keys (by default 1-9, §4 "Keyboard") pick an option;
one answer is given on the first click, several are confirmed with Continue.

**Swiping** (`swipe`, `components/SwipeCard.tsx`): in a loop the unit is
the card (framed only with `card: true`). The coder drags anywhere on the
coding area; past 30% of the width (120 px up), or flung, the card flies off
and that option is the answer. Direction buttons, arrow keys and the
shortcut style's keys work too. Vertical drags still scroll long units (`touch-action: pan-y`).

### Span and relation answers

- Span and relation questions are ordinary steps. `StudyRunner` mounts a
  `SpanAnnotationProvider` per unit; only the active span question's fields
  can select (§3, "Selectable text").
- Spans are stored as character offsets plus the selected text and the
  field. Word mode snaps to words; character mode takes the exact selection.
- Spans may overlap. Clicking a span opens its labels; Backspace or Delete
  removes the last span.
- The keyboard (`SelectableText`, in the field clicked last, else the
  first; the cursor is the span context's, and the arrows go on into the
  next or previous field at the text's ends): the
  arrows move a word cursor (up/down by line, from where the words are on
  screen); Space starts a selection, the arrows extend it, Space ends it
  and focuses the first label button (`data-span-label`). Labels take the
  shortcut style's keys (`useKeyTargets` at editor priority; the menu at
  the selection shows the same keys, `useTargetKeys`). Enter on a labelled
  word opens its spans; Shift + Enter is Done.
- Relations link two spans of earlier span questions of the loop, with one
  of the relation's options, as its `rules` allow (contracts
  `relations.ts`; the server checks them on submit). During a relation
  question `StudyRunner` adds a `RelationAnnotationProvider`; the selectable
  text shows the rules' spans as buttons (`RelationText`): click a start,
  then a destination; with several possible types the answer field asks.
  `RelationArrows` draws the relations as arcs (faint until pointed at,
  then solid with their label; a click opens the relation) in an SVG
  inside the unit's content, positioned against it: it scrolls with the text, and is measured
  again only when the relations change or the content resizes.

### End items

An `end` item ends the session when reached, in a branch (not at the top level):
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
  question, or on practice units (`InstructionOpening.opens`).

### Comments

A question item's `comments: true` lets coders comment on their answer
(`VariableValue.comment`, at most `MAX_COMMENT_LENGTH`); span and relation
questions comment on each span or relation (`SpanAnswer.comment`,
`RelationAnswer.comment`) instead: in the span editor (`SpanEditLabel`)
and the relation list. A comment is saved with the answer; one changed on
an answer already given is saved when the box is left
(`StudyManager.comment`: coder-level answers at once, a unit's in its draft,
a finished unit posted again), without moving on. Exports: a
`<question>.comment` column; span and relation comments in `.json`.

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

One key listener (`keyboard/KeyboardProvider.tsx`, its logic in
`keyboard/keyDown.ts`) and a `KeyController` (`keyboard/controller.ts`)
whose scopes get key presses in turn, by priority: menus (10) over span
editors (5) over answer fields (0) over the base layer (-10); among equals
the latest registered. A scope that uses a key ends it. Text fields, the
leader and held keys are handled once, before the scopes.

- **Held keys.** A key held down chooses once: its repeats are dropped when
  the first press was used by the keyboard, so a held `1` doesn't answer the
  next questions too. When the first press was not used, the repeats are the
  browser's: holding ↓, Space or PageDown scrolls. Presses the browser's
  input method is composing (an IME's Enter) are left alone.
- **Exclusive menus.** While a menu, popover or dialog of the coding screen
  is open (`useMenuKeys`), an exclusive scope at menu priority keeps every
  key it doesn't use from the scopes below: no key answers the question
  behind an open menu. A menu's own keys (the loop panel's number pad) are
  scopes above it.
- **↑ and ↓.** The arrows move focus between the answer targets
  (`data-key-target`) by where they are on screen (`keyboard/focus.ts`).
  With focus outside the targets, ↑ and ↓ first scroll the unit
  (`data-key-scroll`) while it has more to show that way; at its end they
  move to the answers (the chosen one, else the first). An element that
  keeps the arrows for itself is marked `data-keys-own` (selecting text for
  a span).

- Answer fields declare their choices (`useKeyTargets`: groups of targets; a
  scale has a group per item) and get each target's key for its badge.
- A `KeyMapping` (`keyboard/mappings.ts`) decides which key picks which
  target: numbers (default), numpad (by position, up to 3 x 3), fast type
  (each label's shortest unique start, id `letters`) or type to filter. Where a mapping can't map a group, numbers do.
  The coder's choice is stored in the browser. The keyboard menu in the
  coding screen's top bar (`studyRunner/KeyboardMenu.tsx`) lists the
  shortcuts and holds the shortcut style and "Show shortcut badges".
- The base layer: arrows move focus by screen position, Space/Enter click
  the focused button, Ctrl + Left/Right go to the previous/next question
  (Alt + arrows too, for Macs where Ctrl + arrows are the system's),
  Ctrl + Enter continues an answered question, Ctrl + Space opens the
  instruction (`keyboard/commands.ts`).
- **Browser history** (`studyRunner/browserHistory.ts`, only in the real
  coding screen, never a preview). Each new place (`positionOf`) the coder
  gets to pushes one entry with the same URL, keeping the router's state and
  adding `{ codingStep: n }`; a `Trail` (keys per entry, the one shown) says
  whether an entry is new. The browser's Back/Forward (`popstate`) call the
  screen's own back/forward once per step. The screen's own buttons and keys
  call `history.back()`/`forward()` where an entry is there, so both stay in
  step and no entry is added (a new place after going back replaces the
  entries ahead). On the first question Back leaves the page. After a reload
  only the entries pushed since count.
- **`useFocusAfterBack`** (`keyboard/hooks.ts`). Going back with the
  keyboard asks the controller to focus the answer (`requestFocus`), so the
  coder can change it at once. The question itself takes the request when it
  comes on screen (`Question.tsx` calls the hook, whatever its answer
  field), once it is painted, and focuses the chosen target, else the first.
  A field without targets (a text box) focuses nothing, and the request
  never waits for a later question.
- **The leader key** (`keyboard/leader.ts`): `/`, then one key for a
  command, so every command also works with one hand on the numpad.

  | After `/` | Command | Dispatched as |
  | --- | --- | --- |
  | Enter | continue | Ctrl + Enter |
  | `4` or ← | the previous question | Ctrl + ← |
  | `6` or → | the next question | Ctrl + → |
  | `0` or Space | the question's instruction | Ctrl + Space |
  | `8` | the special answer don't know | Ctrl + 8 |
  | `9` | the special answer not applicable | Ctrl + 9 |

  - The leader is the typed character `/`, however the keyboard types it
    (Shift + 7 on a German one), or the physical keys `Slash` and
    `NumpadDivide` whatever they type; never with Ctrl, Alt or ⌘.
  - Digits are read from the physical key (`Digit4`, `Numpad4`), else from
    the character.
  - It waits 3 seconds for its command (`LEADER_TIMEOUT`); after that the
    next key is an ordinary key again. `/` again, Esc, or any key that is no
    command ends it at once; modifier keys (Shift, AltGr, NumLock) don't.
  - Not while typing text, where `/` is a character. In a number's box it
    works: a number has no `/`.
  - While it waits, a hint lists the commands (`KeyChoiceFlash`). The
    special answers are `useSpecialKeys`, with badges `/8` and `/9` (the
    codes surveys use: 88, 99).

  Commands always work, whatever the answer keys setting.

### Study entry

The design's `session` item (always first, never shown to coders) holds the
who codes (`architecture.md` §6.1), the URL parameters (§7), the
normal end and the display. The server reads them when a session starts; the
client sees only the values, as `$session.<name>`.

In the editor it isn't a tree item: above the tree, `SessionHeader.tsx` edits
the public title and has a button per part (**Who codes**, **URL
parameters**, **Display**) that opens that part alone (`SessionItemForm.tsx`,
the open part in `session/sessionTab.ts`); its JSON is that part only
(`SessionPartJson.tsx`) and its preview shows what it means for coders
(`SessionPreview.tsx`: the links, what a link must carry, the screen). Who
codes (**Expert coders** or **Crowd (one link)**) is chosen in the form
(`session/InvitationSettings.tsx`): two cards (`session/WhoCodesCards.tsx`),
none chosen in a new design, and the chosen kind's options below them. The
choice can be changed until the study's first deploy; switching to a crowd
while the study has expert coders shows that they aren't used, with a way
to delete them (`coders/UnusedExpertsNotice.tsx`). After the first deploy
the kind is fixed (the study's `coderKind`, which the editor passes on,
`session/coderKind.ts`): the form says "fixed since the first deploy" and
shows that kind's options only. An invitation for the other kind is then a
validation error; the form shows a button that replaces it. The
expert coders form shows the units' coder set (`coder_set`: how many
coders, or that one is required), how coders get in (disabled until
there is a coder set), and what that asks of the coders
(`coders/InviteChecks.tsx`, contracts `coderInviteChecks`: an email address
each where they sign in, no ids like addresses where they pick a name).
"Create coder set…" / "Update coder set…" opens the coder set dialog
(`session/CoderSetDialog.tsx`, also on the Units and Coders pages), in two
tabs. **Select coders** (`session/coderSet/SelectCoders.tsx`, its plan as
plain functions in `admin/coderSet.ts`): a checklist of the study's expert
coders, those of the draft's coder set checked (all without one), then how
the units are divided: coders per unit or everyone codes everything; an
existing coder set is replaced after asking, or its units without a coder
(not test units) go to the selected coders and the rest stays. Its test
units: the current ones (counts per type from `test_set`) are kept and
shown disabled; with "Redistribute test units" that many overlap, practice
and gold units are drawn anew. It keeps the units coders already coded with
them by default (`GET /coders/units`, contracts `distributeUnits`).
**Manage coders** (`session/coderSet/ManageCoders.tsx`): the add-coders form
and the expert coders there are; the dialog opens on it while the study has
none. No names are typed into the coder set: it names expert coders only.
The One link form has
the coder id URL parameter and "Max. nr of coders". **At the end**, a button below the tree, edits the normal end
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
| `$var.<q>.value`, `.label`              | the answer; `null` when unanswered                                                 | single nominal, ordinal, numeric, swipe, experiment |
| `$var.<q>.values`, `.labels`            | the answers; `[]` when unanswered                                                  | nominal `multiple`, span, relation                |
| `$var.<q>.texts`                        | the selected texts                                                                 | span                                              |
| `$var.<q>.values`                       | one entry per item, in the items' order: the item's value, or `null` for an item without one (not answered yet, or a special answer without a numeric code). Never shorter than the items, so `values[0]` is always the first item; drop the nulls before averaging (`values.filter(v => v !== null)`) | scale                                             |
| `$var.<q>.items.<item>.value`, `.label` | one item                                                                           | scale                                             |
| `$var.<q>.special`, `.items.<item>.special` | the special answer given (`dont_know`, `not_applicable`), else `null`; helpers also match it (`.is("dont_know")`) | questions with `specials` |
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
| single (nominal, swipe, experiment) | `is(v)`, `isAny(v1, v2, ...)`                     |
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

A branch's condition (required) hides its children when false, showing
its `elseChildren` instead, if any. A unit loop's condition decides whether the coder gets the loop at
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

`components/admin/AdminApp.tsx` is a shell with the study's pages: Overview, Design, Units,
Coders, Deploy (with the deploy history), Links, Results, Settings. It uses a `ResearcherApi`
(`api/httpResearcherApi.ts`).

**Where things are.** A component per file; a page's parts are in a folder
named after it, next to the page's own file. Logic without React is in
`lib/admin/` (downloads, uploads, queries) and `lib/design/` (the draft,
versions, the backup), each with its tests.

| Folder under `components/admin/` | Holds |
| --- | --- |
| `study/` | A study's shell: `StudyAdminView.tsx` (loads the study; "doesn't exist, or no access" for a 404), `StudyHeader.tsx`, `StudyPage.tsx`, `useSaveBeforeLeaving.ts` |
| `studyList/` | The studies list's cards, the create menu and dialog, `DeleteStudyDialog.tsx` |
| `account/` | `ResearcherGate.tsx`, `AccountMenu.tsx`, `ResearcherAccess.tsx`, `DeleteAccountDialog.tsx` |
| `server/` | The server admin page, a tab per file (`UsersTab.tsx`, `PlansTab.tsx`, `RequestsTab.tsx`, `StudiesTab.tsx`) |
| `designEditor/` | The editor's parts: `useDesignDraft.ts` (the draft, saving, the backup), `EditorToolbar.tsx`, `TreePanel.tsx`, `ItemPanel.tsx`, `ItemPreview.tsx`, `ItemJsonEditor.tsx`, `SessionHeader.tsx` |
| `designTree/`, `itemForm/`, `variableType/`, `unitLoop/`, `session/` | The tree's rows, and the forms of an item, a question type, a unit loop and the Study entry |
| `jsonEditor/` | Monaco: the JSON and template editors and their setup |
| `units/`, `units/upload/` | The Units page; the CSV upload (`UploadUnits.tsx`, `CsvUnitsForm.tsx`, `ColumnsTable.tsx`, `UploadChoices.tsx`, `useCsvMapping.ts`) |
| `deploy/`, `links/`, `coders/`, `results/`, `overview/`, `preview/`, `guide/` | The parts of those pages |

`ConfirmDeletionDialog.tsx` is the one dialog for deletions that can't be
undone (a study, an account): it says what goes and asks to type its name or
email address, which the request carries as `confirm` (`admin/confirmDeletion.ts`).

- **Login**: `account/ResearcherGate.tsx` shows a login screen unless logged
  in (with the previous provider while the server changes providers, and a
  banner asking to link the new login). `account/AccountMenu.tsx`: email (an
  orange shield when the login had no second factor), API keys, theme,
  **Delete account**, log out. On a development server, development headers
  replace the login.
- **Deleting an account** (`account/DeleteAccountDialog.tsx`,
  `docs/accounts.md` §5): asks the server what would go
  (`GET /me/deletion`), then either lists what keeps the account (a shared
  study the user owns, a study whose only ADMIN they are, being the server's
  only admin, each with what to do first) or lists the studies deleted with
  it and asks to type the email address. Admins delete a registered user the
  same way from the Users tab.
- **Sensitive actions**: on 403 `step_up_required` the API client
  (`HttpResearcherApi`) asks to confirm, sends the browser to log in again
  (`/auth/login?stepUp=1`) and back to the same page; the researcher then
  does the action again. An internal error (500) shows with its request id
  ("Internal error (request id …)"), to report to the server's operator.
- **Accounts**: only researchers create studies; `account/ResearcherAccess.tsx`
  handles requests to become one. Admins get the server admin page
  (`server/ServerAdmin.tsx`, a tab per file in `server/`: warnings, users,
  plans, registration, studies, log; `docs/accounts.md`).
- **From a file** (`ImportStudyDialog.tsx`): a study export (its manifest is
  read in the browser, then `POST /study/import`, with or without coders) or a
  design file (sent as a recipe, `docs/examples.md`). Export is in the study's
  Settings (`docs/hosting.md` "Moving a study"). A researcher's first study
  (empty, from an example or a file) asks whether to take the guide.
- **Guide** (`guide/`): a dialog over the study's pages, like the help: a
  menu of sections and their steps beside the open step, at a fixed height.
  Next and Back go through all steps in order. A step is a title, a few
  lines of text and a picture; on a narrow screen the text is above the
  picture, on a wide one beside a picture that is taller than wide. A
  picture that would get too small to read takes the width, and the step
  scrolls. "Show me" closes the guide and rings the real element on the
  researcher's page (`data-guide` attributes, `ShowMe.tsx`); nothing is
  blocked. The header's **Guide** opens the page's section (a page without
  one: the start), at the step last open there in this session. After a
  first study, `GuidePrompt.tsx` asks (yes or no, it can't be dismissed
  otherwise).

  **Its content is Markdown**, a file per section in `guide/content/`
  (`start.md`, `design.md`, `units.md`, ...), read by `parseGuide.ts` into
  the sections and steps (`guideSteps.ts`). To change the guide, edit these
  files; `guide.test.ts` checks them (below). A file looks like this:

  ```markdown
  ---
  title: Design
  page: Design
  order: 2
  ---

  ## The tree {#tree}
  <!-- show: design, focus: tree, select: topic; show me: Design / add-item / Add item: a question, a unit loop and more -->
  - The tree is the coder's path, from **Start** at the top to the end.
  - Click an item to select it. More in [the design editor](design-editor.md).
  ```

  - The front matter: the section's `title` in the menu, the `page` it
    belongs to (a page's name: Overview, Design, Units, Coders, Preview,
    Deploy, Links, Results, Settings; one section per page) and its `order`
    among the sections. Text between the front matter and the first heading
    is ignored (each file has a note on the format there).
  - `## Title {#id}` starts a step. The id is unique in the whole guide; the
    app opens some steps by it (`openGuide("Design", "modes")`), so keep the
    ids of existing steps. Steps show in the file's order.
  - The line right under the heading may be an HTML comment with what the
    step shows, where "Show me" goes, or both with a `;` between. Without
    it the step is text only.
    - `show: design, focus: …, select: …`: the sample study in the design
      editor. `focus` is `overview` (the whole editor, scaled down, its two
      parts outlined and numbered 1 and 2: write them as a numbered list),
      `tree` (the tree only), `item` (the selected item's form and preview)
      or `form` (its form only). `select` is the name of the item selected
      (`age`, `news_use`, `topic`, `tone`, `actor`; `session` for Who
      codes); it is optional.
    - `show: map` (a study's five steps), `units`, `add-coders`, `coders`,
      `deploy`, `links` or `results`: that page with sample data.
    - `show me: Page / name / Text`: the page the button goes to, the
      `data-guide` name of the element it rings there (`tab-Deploy` etc.
      for a page's tab), and what the pointer says.
  - The rest is the step's text, in Markdown as the help topics have it
    (rendered by the help's `HelpMarkdown.tsx`): bullets, **bold**,
    `code`, and links to help topics by their file name (`[units](uploading-units.md)`),
    which open the help. A numbered list gets round numbers like the
    overview's markers. Keep a step to three or four short lines: the
    picture does the work.

  `guide.test.ts` fails with what is wrong and where when a file doesn't
  parse (a heading without an id, an unknown `show` or `focus`, a `show me`
  without its three parts, a step without text), an id is used twice, a
  `select` names no item of the sample design, a `show me` names no
  `data-guide` element in the client, or a link names no help topic. It
  also lists the sections and step ids in order: update that list when
  adding, removing or moving a step.

  **The pictures** (`GuideSample.tsx`) are the real components with the
  sample study (`sampleStudy.ts`: a design with two coder questions and a
  unit loop with three questions, the third in a branch, three units and
  expert coders; `sampleData.ts`: its coders, links and results), from an
  in-memory API that refuses writes. They are inert (nothing can be clicked
  or focused) and scaled to fit, never larger than drawn. The design editor
  is drawn read only at a wide window's size (tree, form and preview side
  by side) and cut to the step's focus, so it has no + buttons. The pages
  (`SamplePages.tsx`): the Units page itself; the Coders table, the form
  to add coders, the links table and the results' answers and agreement
  with sample data; the Deploy page's parts for a later deploy. A new kind
  of picture is a name in `parseGuide.ts` (`SAMPLE_PAGES`), the size it is
  drawn at in `pictures.ts` (which also has the editor's focuses and
  markers) and what it draws in `SamplePages.tsx`.
- **Who codes** (`session/WhoCodesCards.tsx`, the two kinds as cards): chosen
  in the design's Who codes, not when a study is made
  (`studyList/CreateStudyDialog.tsx` asks for a name only) or in its
  Settings. A new design has no invitation (`design/draft.ts` `startDraft`):
  the tree's Start row says "who codes? Choose first", and deploying needs
  the choice. Pages that depend on who codes (Coders, Units, the overview)
  follow `admin/whoCodes.ts` (`useWhoCodes`): the kind the first deploy
  fixed, before it the kind the draft design invites.
- **Tree** (`DesignTreeView.tsx`, `designTree/`): the top level holds
  questions, experiments, `branch`es and unit loops; validation refuses an
  end item there ("An end item goes in a branch") and a loop inside a
  branch. A branch has a `condition` (required: a new one's script is
  empty, which validation flags until set), an optional `label`,
  `children` and optional `elseChildren`. The coder-level items before,
  between and after loops are grouped in a lightly tinted card (only in the
  tree); each loop is its own card; a branch lines up with the items around
  it, its items one step in; its else items follow under an "Else" row, as
  far in as the others. A branch's row shows its label
  and/or "if <condition>", else "Branch"; questions aren't numbered. Without
  else items yet its row has an else button that opens
  the usual add menu, headed "If not, then…", and adds the chosen item as
  the first else item; the Else part shows only when it has items. "Add item" adds a question, experiment, branch
  ("Branch", starting empty) or unit loop; a row's + adds items
  allowed there (`insertableTypesAt`): in a branch question, experiment,
  branch, end; in a loop question, layout ("Layout"), branch,
  end. A layout item's row shows "Layout", or "Layout – <label>",
  in the loop's colour. Above the tree the
  Study entry (§4), below it the **At the end** button, styled like the
  Study entry's buttons.
- **Design editor**: edits the whole design in memory, validated with
  `validateDesignItems`, saved as a whole.
  - **Visual**: the tree, and the selected item as a form, as JSON
    (`ItemJsonEditor.tsx`) or as a preview (`ItemPreview.tsx`: a loop with the
    study's units, a picker for the question on screen, answer pickers for
    `::: if`). On screens at least 1500 px wide the preview is a third column.
    Branches, loops and layout items have no name; loops show their label or
    "Unit loop", layout items "Layout" (with their label: "Layout – <label>"). Moving and deleting work on ticked items from the toolbar; where a
    place is ambiguous (the end of a container) the menu asks where.
  - **JSON**: the whole design (`DesignJsonEditor.tsx`), in Monaco (loaded
    with the editor) with completion and checks from the design's JSON Schema
    (`designJsonSchema`). JSON, not YAML: no indentation to get right.
  - Both JSON views apply an edit once it parses to items the tree can show;
    until then "Not applied" says why.

  Saving and safety:
  - **Save** works with issues (work in progress); previewing and deploying
    need a valid design. The toolbar counts errors and warnings.
  - **Conflicts** (`design/draft.ts` `saveRequest`, `conflictOf`). Two ways
    someone else can be ahead of a save, with one dialog for both ("Someone
    else saved a draft": who, and when):
    - they saved the same draft: the save carries the `revision` the edits
      are based on, and the server answers 409 `design_conflict`;
    - they made a new draft while the open version was being edited (a
      colleague, or an upload in another tab that added a field; `design/versions.ts`
      `draftMadeMeanwhile`). The edits stay on the version they were made on
      (it is pinned), and the client asks before sending anything.

    The dialog offers **Save mine over theirs** (the save is sent without a
    revision, or onto the newer draft: their changes are replaced) or
    **Discard mine, load theirs** (after a confirm: loads the saved draft,
    clears the backup). Closing it keeps the edits unsaved.
  - **Undo/redo**: the last 100 steps (edits less than a second apart are one
    step).
  - Items with unsaved changes have a dot; **Revert** reverts one item or all.
  - A draft is deleted only from the versions dialog.
  - **Backup, per study** (`design/localBackup.ts`). Unsaved edits are copied
    to localStorage a second after each change, under
    `annotinder:design-backup:<studyId>`: the edited items, the items as
    last saved, the version and the revision they are based on, and the
    time. One backup per study, so edits in two studies (two tabs) don't
    overwrite each other.
    - It is cleared when the edits are saved, undone or discarded, and
      when the draft is deleted. An open editor clears only a backup that is
      its own (one it wrote, or the one it started from, `backupKeeper`): an
      earlier session's backup that is still on offer stays.
    - After the browser was closed, the researcher UI offers the latest
      backup in a banner (`BackupBanner.tsx`: the study, and when):
      **Continue editing** opens that study's design with the edits,
      **Discard** throws them away after a confirm.
    - Continued on the version they were made on, the edits are as they were
      left (same changed marks, same revision for the conflict check). If
      another version is current by then (a draft was made or deployed
      since), they become edits of that one (`startDraft`).
    - Too large for localStorage, or storage unavailable (private mode):
      there is no backup, and an outdated one is removed.

- **Unit loops** (`UnitLoopForm.tsx`): besides its label and condition
  (`ItemForm.tsx`, as for branches), the loop's form holds, open, "Units and
  coders" (`unitLoop/UnitsEditor.tsx`): what a coder gets, the previous loop's units
  (`sameAsPrevious`), the **Part** (a value of `part_set`; without a part
  set, "Make a part set…"), for a crowd who codes each unit (everyone codes
  everything, or divide the units: the distribution criteria). Folded below
  (`FoldedSection` in `unitLoop/Section.tsx`: a button with `aria-expanded`,
  closed its header sums the settings up, an error opens it): "Test units"
  (`unitLoop/SpecialUnits.tsx`: the coding units and the test units, `test_set`:
  overlap, practice, gold, with their placement, the checks: right answers in
  `answer_<q>`, "Create gold values…") and "Order" (`architecture.md` §6.2).
- **Experiments** (`variableType/RandomConditionFields.tsx`): assigned at
  random, balanced or from a URL parameter (one with values, from the Study
  entry); "Each condition gets its own units (condition_set)" (`units:
  true`; "Make a condition set…" without one), optionally with
  `condition_set`'s values as the conditions.
- **Layout items** (`unitLoop/LayoutForm.tsx`, opened by selecting the
  item): a simple form (title, byline, body) or **Advanced**: the template in Monaco
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
  front matter, links, the topics the UI opens, and every example. The
  Markdown itself is rendered by `HelpMarkdown.tsx` (the guide's steps use
  it too); `topicText.ts` reads front matter and links without loading the
  topics.
- **Versions and deploying** (`design/versions.ts`): _live_ is the deployed
  version (frozen), _draft_ the latest if not frozen, _history_ the rest
  (read only, restorable as the draft). Editing the live version saves a new
  draft. The editor only saves; **Deploy** (`DeployPage.tsx`,
  `DeployPanel.tsx`; `PUT /deployment`) deploys the saved draft and the draft
  units and sets: it lists changes against the live version (`design/diff.ts`), takes a version note, and shows
  the server's errors and warnings (reopened units, removed option values,
  changed types). With expert coders it also says, before deploying, which
  coders lack an email address where coders sign in and which ids look like
  addresses where they pick a name (`coders/InviteChecks.tsx`), and how many
  units have no coder (`coders/UnassignedNotice.tsx`), with the way to the
  Coders page. Below, it lists every deploy with its design version's note
  (`DeployHistory.tsx`). Coders switch to the new version on their next
  request (§2).
- **Question forms** (`VariableTypeForm.tsx` picks the form per type in
  `variableType/`; `ItemForm.tsx`, with end items and loop-question fields in
  `itemForm/`): the options editor
  (`OptionsEditor.tsx`: label, value, colour, order; ordinal values renumber
  unless "Custom values"), special answers (a "+ Add special option" menu next to "+ Add option", rows under the options: `specialAnswers/`; `variableType/SpecialAnswersFields.tsx` where there are no options), `multiple`, a layout select whose `auto` entry
  names its choice, numeric range, step and labels. Switching nominal ↔
  ordinal keeps the options. A branch's or loop's condition
  ("Only show these items if…", always there for a branch; for a loop
  optional, "Only give coders this loop if…") uses
  `ConditionEditor.tsx`:
  **Rules | Script** over the same script. Rules are a flat list joined by
  all "and" or all "or" (`design/conditionRules.ts`); a row that no longer
  fits its question stays and says why. Other scripts open in script mode with
  a cheat sheet and a syntax check.
- **Units** (`units/`): CSV upload (`units/upload/UploadUnits.tsx`, own parser
  `admin/csv.ts`, the mapping in `admin/uploadUnits.ts`): pick the id column, which columns to upload as which field,
  and their types (inferred and checked); columns named like a role column
  (`coder_set`, `condition_set`, `part_set`, `test_set`) are that column.
  The parser reads commas, or semicolons when the first line has semicolons
  and no comma, and says what the researcher should know about how the file
  was read (`hints`: read as semicolons, a quote never closed, rows with
  more or fewer cells than the first line). Uploading a role column replaces
  it: the form says how many units not in the file lose their value. When
  the server refuses the upload (a column `answer_<x>` or `feedback_<x>`
  where `<x>` is no question of the design: the prefixes are reserved), its
  message is shown as it is. A `coder_set` column that names a coder who
  isn't an expert coder of the study isn't uploaded: the form says who
  (`unknownFileCoders`), before anything is sent.
  A line says how many expert coders the study has, with the way to the
  Coders page (`units/CodersSummary.tsx`), and a notice how many units have
  no coder.
  The role columns with their labels (Coder set, Condition set, Part set,
  Test set); a paged table of units, the role columns tinted and headed by
  their label; pick a value to see its units in order; "Create special
  set…", a menu of the role columns: the coder set dialog, a split into a
  part or condition set (`SplitIntoSets.tsx`), a test set
  (`TestSetDialog.tsx`: counts per type, drawn at random, practice units
  ordered). An existing column is overwritten after asking, or (coder,
  part, condition set) its units without a value that aren't test units
  get one and the rest stays (`AssignMode.tsx`, `admin/setKinds.ts`
  `assignWithoutValue`); put selected units in a value,
  remove them, or reset their answers. A coded unit is replaced only by
  uploading it again, after a warning.
- **Overview** (`overview/`), kept simple: live/paused/not deployed with
  the live and draft versions; the study in one card of facts (who codes:
  the expert coders and how many started, or the crowd coders who started;
  units; finished units and answers; last activity; active links), each
  opening its page; and the answers per day. Example studies' answers are
  spread over the past two weeks (server `exampleTime`), so this looks like
  a running study. Pausing and resuming (`LiveControls.tsx`) is on the
  Deploy page, the deploys' history too.
- **Settings** (`StudySettingsPage` in `overview/StudyOverview.tsx`): the
  team (`overview/TeamSettings.tsx`, at least one ADMIN) and
  `StudySettings.tsx`: rename, archive,
  when coders finish (the reopen time), panel return links, export, delete. Deleting (`studyList/DeleteStudyDialog.tsx`, also from the studies
  list) says what goes (design versions, units, coders and their answers,
  sessions, results downloads) and asks to type the study's name.
- **Links** (`LinksPanel.tsx`, `links/`): the links deploying made, with their
  label, coder or set, uses (of the design's maximum), status and the URL
  parameters they take (copied with placeholders). Per link: revoke,
  reopen, new secret; no settings of their own.
  Retired links are listed apart. There is no "create": the Study entry
  declares the invitation.
- **Coders** (`coders/CodersPage.tsx`; `coder-identity.md` §2): the coders
  of the kind that codes (`useWhoCodes`: before the first deploy the draft
  design's, after it the study's `coderKind`; not chosen yet: the page says
  so), with a notice for expert coders the design doesn't use
  (`coders/UnusedExpertsNotice.tsx`: "N expert coders … aren't used by this
  design", **Delete them**), in a table
  (`coders/CodersTable.tsx`, its columns and order in
  `admin/codersTable.ts`) that sorts on every column, most left to do
  first: coder, and for expert coders their email address and their units
  as deployed and in the draft, with a marker where those differ (a click
  says: "The draft assigns different units; deploy to apply."), done,
  remaining, last active. A row's actions (`coders/CoderActions.tsx`): their
  email address (`EditEmailDialog.tsx`), their own link (expert coders with
  a link each: copy or open), moving the units they haven't coded to the
  other coders of the draft (`useHandOver.ts`, `admin/moveUnits.ts`), and
  deleting the coder (`coder-identity.md` §8). **Add coders**
  (`AddCodersForm.tsx`, parsed by `admin/parseCoders.ts`): one text box, a
  coder per line: an id, or an id and an email address with a comma,
  semicolon or tab between them, an optional header line; with "The coder
  id is the email address" each line is an address that is both. What was
  read shows as a table, with what is wrong per line, before saving.
  **Make coder set** opens the coder set dialog (§4). A notice says how many
  units no coder has, deployed and in the draft (`UnassignedNotice.tsx`,
  also on Units and Deploy).
  Below, **Sessions** (`coders/SessionsPanel.tsx`, deletion in `coders/`): per coder session the link, started, last active, answers,
  finished units per loop, and how it ended; also sessions without a coder
  id. Deletion requests come first.
  Reset or delete data per session, or by coder ids or emails
  (`coder-identity.md` §8).
- **Results** (`results/`, opens on Questions; the open view in
  `results/resultsView.ts`): **Questions**, **Agreement** (per question
  alpha and the share agreeing; per coder their mean kappa, or a matrix of
  kappa per pair), **Units** (by
  disagreement; one unit through the loop's first layout with every coder's
  answers) and **Coders** (per session: time per unit, practice
  tries, mean kappa) show the
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
  - `sessions.csv`: per coder session the coder-level answers, how it ended, units finished;
  - `coders.csv`: the study's coders, also ones who haven't started (coder id,
    kind, and an expert coder's email address where coders sign in);
  - `units.csv`: the unit versions answered (`architecture.md` §8.4);
  - `variables.csv`: labels per design version, question and option;
  - `devices.csv`, `timings.csv`, `deleted_coders.csv` (`coder-identity.md`
    §4, §10, §8), `display_changes.csv`, `README.txt`, optionally
    `reset_answers.csv`.

  Cells hold values; "Add label columns" (default on) adds `.label` columns
  (the label the coder saw). Several answers are joined with "; ", spans as
  "value: text", relations as "value: from → to". Answers that don't fit a
  cell also get a `.json` column. CSV is UTF-8, written as it is.

- **Preview** runs the latest design as deployment `<publicId>.preview`
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
