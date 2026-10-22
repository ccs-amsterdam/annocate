# Plan: categorical and numeric question types

Status: proposal (2026-10-22), not built. Replaces `select_code`,
`search_code` and `scale` with two types, `categorical` and `numeric`. Once
built, fold the result into `packages/contracts/CONTRACTS.md` and
`docs/client.md`, and delete this file.

## 1. Problem

Today one concept is spread over three types and their options:

- `select_code`, `search_code` and `scale` all ask "pick one (or more) of
  these codes". They differ only in how that looks: buttons, a search
  dropdown, or a row of scale buttons. So part of the UI choice is the
  *type* and part is an *option* (`vertical`).
- Every code has an optional free `value`. It means "ordinal position" on a
  scale, but nothing stops values like 3, 17, 4 on a nominal question.
- The `code` is both what is stored and what the coder sees. Fixing a typo
  in a code changes the data.
- There is no type for numbers (e.g. 0–100 thermometer, age).

## 2. New types

### 2.1 `categorical`

```ts
{
  type: "categorical",
  question, instruction, ...           // shared VariableBase fields
  level?: "nominal" | "ordinal",       // default "nominal"
  codes: [{ code, label?, color?, screenOut? }],
  multiple?: boolean,                  // nominal only
  items?: [{ name, label? }],          // rate several items with the same codes
  layout?: "auto" | "flex" | "row" | "grid" | "compact" | "dropdown",  // default "auto"
  columns?: 1 | 2 | 3 | 4,             // with layout "grid"; default 1
  search?: boolean,                    // filter box above the buttons
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

### 2.2 `numeric`

```ts
{
  type: "numeric",
  question, instruction, ...
  min?: number, max?: number,
  step?: number,                       // default 1; 0.1 = one decimal, 5 = steps of five
  labels?: [{ value, label }],         // break points, e.g. 0 "cold", 50 "neutral", 100 "warm"
  items?: [{ name, label? }],
  layout?: "auto" | "input" | "slider" | "buttons",   // default "auto"
}
```

- `slider` and `buttons` need both `min` and `max`. `input` works with an
  open range.
- The editor offers `step` presets (whole numbers, 1 decimal, 2 decimals)
  plus a custom value.
- `labels` are shown under the slider or buttons at their positions, and as
  hints next to an input.

### 2.3 Other types

- `confirm`, `auto`, `span`, `relation`: unchanged. Their codes also get
  the optional `label` (span and relation labels are shown to coders too).
- `annotinder`: see open question 1.

## 3. Answers

Stored answer shape stays `VariableValue.codes: [{ item?, code?, value? }]`,
so storage, the db server, agreement keys and exports don't change.

| Type | Stored per answer | Notes |
| --- | --- | --- |
| categorical, nominal | `{ code }` | |
| categorical, ordinal | `{ code, value }` | `value` = position the coder saw (1..n) |
| numeric | `{ value }` | no `code` |

Each item adds `item`. Condition and template expressions keep working:
`x.codes[0].code`, `x.codes.find(c => c.item === 'y')?.value`.

Validation (`contracts/codebook/answers.ts`):

- categorical: `code` must be one of the codes; one answer per item (or one
  in total) unless `multiple`. `value` isn't checked: it records what the
  coder saw, and a reordered scale shouldn't make old answers invalid (which
  would re-ask the question, `docs/architecture.md` §8).
- numeric: `value` within `min`/`max` and a multiple of `step` from `min`
  (or from 0), with a float tolerance.

## 4. Layout

### 4.1 Options

- `flex`: buttons wrap and grow to fill each row.
- `row`: one row, equal-width buttons, no wrapping (CSS grid).
- `grid`: `columns` equal columns (1 = a vertical list).
- `compact`: ordinal only. Buttons show the value; the selected one grows
  and shows its label. This is the current `ScaleAnswerField` design. One
  row per item.
- `dropdown`: a searchable combobox (today's `search_code`). For long lists.
- `search: true` adds a filter box above `flex`/`row`/`grid` buttons.

### 4.2 `auto`

A pure function `resolveLayout(variable)` in contracts, so the editor can
show what `auto` picks ("Auto: 2 columns") and it can be unit-tested.

Nominal, `n` codes:

| n | layout |
| --- | --- |
| 2–3 | `row` |
| 4, 6, 8 | `grid`, 2 columns |
| 5, 7 | `grid`, 1 column (no empty cell) |
| 9–15 | `grid`, 1 column, `search` on |
| > 15 | `dropdown` |

Then: any label longer than about 24 characters forces 1 column, and
`row` falls back to 1 column when it doesn't fit.

Ordinal: `row` for 2–3 codes, else `grid` with 1 column, so the order reads
top to bottom. With `items`: `compact` (one row per item).

Numeric: `buttons` (compact row) when `min`/`max` are set and there are at
most 11 steps (e.g. 0–10). `slider` for larger closed ranges. `input` when
the range is open.

## 5. Migrating existing codebooks

Published codebooks are immutable JSON, so migration happens on parse, with
a `z.preprocess` on the variable schema (like `migrateLegacyUnitLoop`). The
editor saves the new shape.

| Old | New |
| --- | --- |
| `select_code` | `categorical`, nominal; `vertical: true` → `grid`, 1 column; else `auto` |
| `search_code` | `categorical`, nominal, `dropdown` |
| `scale` | `categorical`, ordinal; `auto` |
| `value` on codes | dropped |

Effects on data: stored answers keep their codes and values. New answers to
a migrated `scale` whose values weren't 1..n (e.g. -2..2) get 1..n. The
migration should report that as a warning in the editor, since the
researcher may want to keep the old values (open question 2).

## 6. Admin editor

- Type picker: categorical, numeric, confirm, auto (plus span, relation in
  loops).
- Categorical: a nominal/ordinal toggle; a codes editor with code, label,
  colour (no value; ordinal shows the 1..n position read-only and allows
  reordering); `multiple` (nominal only); the items editor; a layout select
  whose `auto` entry shows the resolved choice; `columns` and `search` when
  relevant.
- Numeric: min, max, step presets, the break-point labels editor, items,
  layout.
- The live preview renders the question as configured, so authors see what
  `auto` does.

## 7. Where it changes

- `contracts`: `variableTypes.ts` (new types, migration), `codes.ts` (drop
  `value`, add `label`), `answers.ts` (validation), new `layout.ts`
  helper with `resolveLayout`, `validation.ts`, `CONTRACTS.md`.
- `client`: one `CategoricalAnswerField` replacing the select, search and
  scale fields, plus a `NumericAnswerField`. Show `label ?? code`
  everywhere (span labels, relation labels, annotinder).
  `VariableTypeForm`, `CodesEditor`, the YAML editor tests, `Question.tsx`.
- `job-server`: nothing expected; check `codeOf`/`agreementKey` with
  numeric answers (no `code`).
- `reference-db-server`: the demo seed (`seed.ts`) uses the new types.
- Docs: `client.md`, `CONTRACTS.md`, `TODO.txt` (the nominal/ordinal/numeric
  note), and the `VariableValue` TODO in `variableValue.ts`.

## 8. Order of work

1. Contracts: schemas, migration, validation, `resolveLayout`, with tests
   (migration of every old type, auto layout table, numeric validation).
2. Client answer fields: `CategoricalAnswerField` (all layouts),
   `NumericAnswerField`. Remove the old fields.
3. Editor: forms, codes editor, items, layout select with resolved `auto`.
4. Seed and tests in job-server and reference-db-server.
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
4. **`compact` without items.** Use it for single ordinal questions with
   5 or more codes too, instead of a vertical list? It's compact on phones
   but hides the labels until a choice is made.
5. **Numeric answer shape.** `codes: [{ value }]` keeps everything else
   unchanged but reads oddly. The `VariableValue` discriminated union (TODO
   in `variableValue.ts`) would fix that; out of scope here.
