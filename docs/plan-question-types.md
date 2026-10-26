# Plan: categorical, numeric and scale question types

Status: proposal (2026-10-22, revised 2026-10-26), not built. Replaces
`select_code` and `search_code` with `categorical`, adds `numeric`, and
keeps `scale` for batteries of items. Once built, fold the result into
`packages/contracts/CONTRACTS.md` and `docs/client.md`, and delete this
file.

## 1. Problem

Today one concept is spread over several types and their options:

- `select_code`, `search_code` and `scale` without items all ask "pick one
  (or more) of these codes". They differ only in how that looks: buttons, a
  search dropdown, or a row of scale buttons. So part of the UI choice is
  the *type* and part is an *option* (`vertical`).
- Every code has an optional free `value`. It means "ordinal position" on a
  scale, but nothing stops values like 3, 17, 4 on a nominal question.
- The `code` is both what is stored and what the coder sees. Fixing a typo
  in a code changes the data.
- There is no type for numbers (e.g. 0–100 thermometer, age).
- Answer forms get tall: on a phone they can push the unit off screen.

## 2. Types

### 2.1 `categorical`: one question, pick from codes

```ts
{
  type: "categorical",
  question, instruction, ...           // shared VariableBase fields
  level?: "nominal" | "ordinal",       // default "nominal"
  codes: [{ code, label?, color?, screenOut? }],
  multiple?: boolean,                  // nominal only
  layout?: "auto" | "flex" | "row" | "grid" | "compact" | "dropdown",  // default "auto"
  columns?: 1 | 2 | 3 | 4,             // with layout "grid"; default 1
}
```

- **code vs label.** `code` is the stored identifier (unique, never shown if
  a label exists). `label` is what the coder sees, defaulting to `code`.
  Labels can change without touching data. Later `label` can become
  `string | Record<lang, string>` for translations.
- **No `value` on codes.** Nominal codes have no value. Ordinal codes have
  value 1..n by position; not editable.
- **Ordinal and `multiple` don't combine.** The schema rejects
  `multiple` with `level: "ordinal"`.
- **No items**: rating several items is `scale` (2.3).

### 2.2 `numeric`: one number

```ts
{
  type: "numeric",
  question, instruction, ...
  min?: number, max?: number,
  step?: number,                       // default 1; 0.1 = one decimal, 5 = steps of five
  labels?: [{ value, label }],         // break points, e.g. 0 "cold", 50 "neutral", 100 "warm"
  layout?: "auto" | "input" | "slider" | "buttons",   // default "auto"
}
```

- `slider` and `buttons` need both `min` and `max`. `input` works with an
  open range.
- The editor offers `step` presets (whole numbers, 1 decimal, 2 decimals)
  plus a custom value.
- `labels` are shown under the slider or buttons at their positions, and as
  hints next to an input.

### 2.3 `scale`: several items rated on the same codes

A battery (Likert): the items are what make it a scale.

```ts
{
  type: "scale",
  question, instruction, ...
  items: [{ name, label? }],           // at least one
  codes: [{ code, label?, color? }],   // ordinal: value 1..n by position
  layout?: "auto" | "compact" | "grid",
}
```

- One answer per item. Codes have no `value`: 1..n by position, as ordinal
  `categorical`.
- Today's `scale` *without* items becomes an ordinal `categorical`.

### 2.4 Other types

- `confirm`, `auto`, `span`, `relation`: unchanged. Their codes also get
  the optional `label` (span and relation labels are shown to coders too).
- `annotinder`: see open question 1.

## 3. Answers

Stored answer shape stays `VariableValue.codes: [{ item?, code?, value? }]`,
so storage, agreement keys and exports don't change.

| Type | Stored per answer | Notes |
| --- | --- | --- |
| categorical, nominal | `{ code }` | |
| categorical, ordinal | `{ code, value }` | `value` = position the coder saw (1..n) |
| scale | `{ item, code, value }` | one per item |
| numeric | `{ value }` | no `code` |

Condition and template expressions keep working: `x.codes[0].code`,
`x.codes.find(c => c.item === 'y')?.value`.

Validation (`contracts/codebook/answers.ts`):

- categorical and scale: `code` must be one of the codes; one answer in
  total (or per item) unless `multiple`. `value` isn't checked: it records
  what the coder saw, and a reordered scale shouldn't make old answers
  invalid (which would re-ask the question, `docs/architecture.md` §8).
- numeric: `value` within `min`/`max` and a multiple of `step` from `min`
  (or from 0), with a float tolerance.

## 4. Layout: compact by design

**Goal: the answer form never takes more than about half the screen**
(half the viewport height; on a phone, about 350–420 px), so the unit
stays in view. Only very long question texts should push past it. Every
layout is tight: buttons at least about 40 px tall (comfortable to tap),
little padding, the instruction behind an info icon instead of always
shown.

### 4.1 Options

- `flex`: buttons wrap and grow to fill each row.
- `row`: one row, equal-width buttons, no wrapping (CSS grid).
- `grid`: `columns` equal columns (1 = a vertical list).
- `compact`: ordinal only. Buttons show the value; the selected one grows
  and shows its label. This is the current `ScaleAnswerField` design. For a
  scale: one row per item.
- `dropdown`: a combobox, always with a filter box. For long lists.

There is no separate search option on buttons: many codes means a
dropdown.

### 4.2 `auto`: the most readable layout that fits

`resolveLayout(variable, { width, height })`, a pure function in contracts
with the measured width of the answer form and its height budget (about
half the viewport). It estimates each candidate layout's height from the
number of codes, label lengths and the width, and takes the first that
fits, in order of readability. The editor shows what `auto` picks for a
phone and a laptop ("Auto: 2 columns on a phone"), and it is unit-tested.

- Nominal: `row` (2–3 short labels), then `grid` with 2 columns, then
  1 column, then `dropdown`, which always fits. Long labels rule out
  multiple columns.
- Ordinal: `row` for 2–3 codes, then `grid` with 1 column (the order reads
  top to bottom), then `compact`.
- Scale: `compact`, one row per item; if the items don't fit, page through
  them (open question 6).
- Numeric: `buttons` (compact row) when `min`/`max` are set and there are at
  most 11 steps (e.g. 0–10); `slider` for larger closed ranges; `input`
  when the range is open.

The form re-resolves when the size changes (rotating a phone).

## 5. Migrating existing codebooks

Published codebooks are immutable JSON, so migration happens on parse, with
a `z.preprocess` on the variable schema (like `migrateLegacyUnitLoop`). The
editor saves the new shape.

| Old | New |
| --- | --- |
| `select_code` | `categorical`, nominal; `vertical: true` → `grid`, 1 column; else `auto` |
| `search_code` | `categorical`, nominal, `dropdown` |
| `scale` with `items` | `scale`; `auto` |
| `scale` without `items` | `categorical`, ordinal; `auto` |
| `value` on codes | dropped |

Effects on data: stored answers keep their codes and values. New answers to
a migrated `scale` whose values weren't 1..n (e.g. -2..2) get 1..n. The
migration should report that as a warning in the editor, since the
researcher may want to keep the old values (open question 2).

## 6. Admin editor

- Type picker: categorical, numeric, scale, confirm, auto (plus span,
  relation in loops).
- Categorical: a nominal/ordinal toggle; a codes editor with code, label,
  colour (no value; ordinal shows the 1..n position read-only and allows
  reordering); `multiple` (nominal only); a layout select whose `auto`
  entry shows the resolved choice; `columns` for a grid.
- Scale: the items editor and the codes editor; layout.
- Numeric: min, max, step presets, the break-point labels editor, layout.
- The live preview renders the question as configured, so authors see what
  `auto` does.

## 7. Where it changes

- `contracts`: `variableTypes.ts` (new types, migration), `codes.ts` (drop
  `value`, add `label`), `answers.ts` (validation), new `layout.ts`
  helper with `resolveLayout`, `validation.ts`, `CONTRACTS.md`.
- `client`: a `CategoricalAnswerField` replacing the select and search
  fields, a `NumericAnswerField`, and the `ScaleAnswerField` adapted (labels,
  paging). Measuring the form's width and height budget for `auto`. Show `label ?? code`
  everywhere (span labels, relation labels, annotinder).
  `VariableTypeForm`, `CodesEditor`, the YAML editor tests, `Question.tsx`.
- `server`: nothing expected in the runtime; check `codeOf`/`agreementKey`
  with numeric answers (no `code`). The demo seed (`seed.ts`) uses the new
  types.
- Docs: `client.md`, `CONTRACTS.md`, and the `VariableValue` TODO in
  `variableValue.ts`.

## 8. Order of work

1. Contracts: schemas, migration, validation, `resolveLayout`, with tests
   (migration of every old type, `auto` for phone and laptop sizes,
   numeric validation).
2. Client answer fields: `CategoricalAnswerField` (all layouts),
   `NumericAnswerField`, `ScaleAnswerField`; the height budget. Remove the
   old fields.
3. Editor: forms, codes editor, items, layout select with resolved `auto`.
4. Seed and tests in `packages/server`.
5. Docs.

## 9. Open questions

1. **`annotinder` (swipe).** Fold it into `categorical` as `layout: "swipe"`
   (at most 3 codes, single answer, no items)? It is the same question,
   shown differently. Recommendation: yes, in a later step, once the swipe
   card UI exists; keep the type for now.
2. **Custom ordinal values.** Do researchers need ordinal scales like
   -2..2 or 0..4? Recommendation: no custom values, but an optional
   `start` (default 1), so 0..4 and -2..2 are possible without free values.
3. **Ordinal `value` in the answer.** Store it (what the coder saw) or derive
   it at export from the codebook version (annotations are tagged with
   `codebookId`)? Recommendation: store it; it's cheap and survives
   reordering.
4. **`compact` for a single ordinal question.** `auto` uses it only when a
   vertical list doesn't fit (§4.2). It's compact on phones but hides the
   labels until a choice is made.
5. **Numeric answer shape.** `codes: [{ value }]` keeps everything else
   unchanged but reads oddly. The `VariableValue` discriminated union (TODO
   in `variableValue.ts`) would fix that; out of scope here.
6. **A scale that doesn't fit.** Page through the items ("items 1–5 of 12")
   or scroll within the form? Recommendation: page; it keeps the form
   within its budget.
7. **Numeric batteries** (a feeling thermometer for several parties, 0–100).
   Leave out for now, or let `scale` later take a numeric range instead of
   codes? Recommendation: leave out until a real case asks.
