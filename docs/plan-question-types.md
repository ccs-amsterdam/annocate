# Plan: question types, answer values and conditions

Status: decided, not built (2026-10-22, revised 2026-10-26). Replaces
`select_code` and `search_code` with `categorical`, adds `numeric`, keeps
`scale` for batteries of items; options get a value and a label; conditions
become one notation with checked helper methods. Once built, fold the result
into `packages/contracts/CONTRACTS.md` and `docs/client.md`, and delete this
file.

## 1. Problem

- One concept is spread over several types: `select_code`, `search_code`
  and `scale` without items all ask "pick one (or more) of these". They
  differ only in how that looks, so part of the UI choice is the *type* and
  part is an *option* (`vertical`).
- Every code has a string `code` (stored *and* shown) and an optional free
  numeric `value`. Fixing a typo in a code changes the data; nothing stops
  values like 3, 17, 4 on a nominal question.
- There is no type for numbers (e.g. 0–100 thermometer, age).
- Conditions come in two notations (rules and scripts); only rules are fully
  checked, and references like `.code` / `.value` change shape with the
  question.
- Answer forms get tall: on a phone they can push the unit off screen.

## 2. Options: a value and a label

Every option of a question is `{ value, label?, color? }`, as analysis
software has it (value labels in SPSS and Stata, labelled vectors in R):

- **The value is the source of truth**: what is stored, compared, used in
  conditions and exported. A single number or string, never a list or
  object. Unique within the question.
- **The label is display only** (defaults to the value). It can change, and
  later be translated (`string | Record<lang, string>`), without touching
  data.
- **Nominal** questions: values are strings or numbers, the researcher's
  choice (`"sports"`, or `1` as in many survey traditions).
- **Ordinal** questions (and scales): values are **numbers, rising in the
  order of the options**; default 1..n, any numbers allowed (0..4, -2..2).
  So comparing values is comparing order, and the export is numeric.
- If a researcher wants both a mnemonic and a number, they choose one as
  the value; the other is a label or a recode in analysis. Annotations
  record the codebook version (`codebookId`), so the mapping is never lost.
- Changing an option's value in a published codebook changes what earlier
  answers mean, like renaming a question: the editor warns.

Spans and relations use the same options (`{ value, label?, color? }`).

## 3. Types

### 3.1 `categorical`: one question, pick from options

```ts
{
  type: "categorical",
  question, instruction, ...           // shared VariableBase fields
  level?: "nominal" | "ordinal",       // default "nominal"
  options: [{ value, label?, color?, screenOut? }],
  multiple?: boolean,                  // nominal only
  layout?: "auto" | "flex" | "row" | "grid" | "compact" | "dropdown",  // default "auto"
  columns?: 1 | 2 | 3 | 4,             // with layout "grid"; default 1
}
```

Ordinal and `multiple` don't combine (the schema rejects it).

### 3.2 `numeric`: one number

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

`slider` and `buttons` need both `min` and `max`; `input` works with an open
range. The editor offers `step` presets (whole numbers, 1 or 2 decimals)
plus a custom value. `labels` are shown at their positions under a slider
or buttons, and as hints next to an input.

### 3.3 `scale`: several items rated on the same options

A battery (Likert): the items are what make it a scale.

```ts
{
  type: "scale",
  question, instruction, ...
  items: [{ name, label? }],           // at least one
  options: [{ value, label?, color? }], // ordinal: numbers rising in order
  layout?: "auto" | "compact" | "grid",
}
```

One answer per item. Today's `scale` *without* items becomes an ordinal
`categorical`.

### 3.4 Other types

- `confirm`, `auto`: unchanged (`auto` options get the same
  `{ value, label? }`).
- `span`, `relation`: their codes become options.
- `annotinder` (swipe): open question 1.

## 4. Answers

The stored answer (`VariableValue`) holds values, not codes:

| Type | Stored | |
| --- | --- | --- |
| categorical | `values: [{ value }]` | one, or several with `multiple` |
| numeric | `values: [{ value }]` | a number |
| scale | `values: [{ item, value }]` | one per item |
| span | `spans: [{ value, field, offset, length, text }]` | |
| relation | `relations: [{ value, from, to }]` | |
| confirm | `{}` (just `done`) | |

Plus `done` and `skip` as today. Agreement keys and exports use the values.

Validation (`contracts/codebook/answers.ts`): every value is one of the
options (categorical, scale, span, relation), one per item for a scale, at
most one unless `multiple`; numeric: within `min`/`max` and a multiple of
`step` from `min` (or from 0), with a float tolerance.

## 5. References and conditions

### 5.1 References: the name says the shape

| Question | References |
| --- | --- |
| categorical (single), numeric | `$var.q.value`, `$var.q.label`: null when unanswered |
| categorical with `multiple`, span, relation | `$var.q.values`, `$var.q.labels`: empty when unanswered; span also `$var.q.texts` |
| scale | `$var.q.values` (all items, in item order); one item: `$var.q.items.<item>.value`, `.label` |
| any | `$var.q.answered`: answered and not skipped |

Using `.value` on a multiple-answer question or `.values` on a single one is
a validation error.

### 5.2 Helper methods, checked by validation

Methods on the question (not on its value), so validation knows the type and
checks both the method and its arguments. Every method is false while the
question is unanswered.

| Question | Methods |
| --- | --- |
| categorical, single | `is(v)`, `isAny(v1, v2, ...)` |
| ordinal, and scale items (`$var.q.items.x`) | also `gt(v)`, `gte(v)`, `lt(v)`, `lte(v)` |
| categorical with `multiple` | `has(v)`, `hasAny(...)`, `hasAll(...)`, `count()` |
| numeric | `eq(v)`, `gt(v)`, `gte(v)`, `lt(v)`, `lte(v)`, `between(a, b)` |
| span | `has(v)` (a span with that value), `count()` |

Validation: the method fits the question's type (`$var.topics.gte(4)` on a
nominal question is an error), and every argument is one of the options'
values (or, for numeric, a number in range). Ordinal comparisons compare
values, which are numbers in the order of the options (§2); labels are never
used in logic.

### 5.3 One notation for conditions

A condition is a script. A **simple** condition uses only helper calls,
`$var.q.answered`, `&&`, `||`, `!` and parentheses:

```js
$var.topics.has("sports") && ($var.edu.gte(3) || !$var.consent.answered)
```

- The condition editor's rules mode reads and writes exactly this form;
  there is no separate rules format to store anymore.
- Anything else is an **advanced** script: plain JavaScript in QuickJS with
  the same methods and references. Its references are checked as now, its
  values not. The editor recommends the helpers for that reason.
- Simple scripts are evaluated in TypeScript (no QuickJS), as rules are now.
- Unit loop branches (`when`) use the same conditions.

## 6. Layout: fixed and compact

**`auto` is fixed per question**, not per device: every coder sees the same
layout, so devices don't become a mode effect in a survey or experiment.
`resolveLayout(variable)` is a pure function in contracts, designed for the
**smallest phones** (about 360 px wide) and a height budget of half such a
screen. Larger screens show the same layout, centered at a set maximum
width; only spacing and font size scale. The editor shows what `auto`
picks.

Every layout is tight: buttons about 40 px tall (comfortable to tap), little
padding, the instruction behind an info icon instead of always shown.

### 6.1 Options

- `flex`: buttons wrap and grow to fill each row.
- `row`: one row, equal-width buttons, no wrapping (CSS grid).
- `grid`: `columns` equal columns (1 = a vertical list).
- `compact`: ordinal only. Buttons show the value; the selected one grows
  and shows its label (the current `ScaleAnswerField` design). For a scale:
  one row per item.
- `dropdown`: a combobox, always with a filter box. For long lists.

### 6.2 `auto`

From the number of options and the length of their labels, for a 360 px
wide screen within the height budget:

- Nominal: `row` (2–3 short labels), else `grid` with 2 columns (short
  labels), else 1 column, else `dropdown`, which always fits.
- Ordinal: `row` for 2–3 options, else `grid` with 1 column (the order reads
  top to bottom), else `compact`.
- Scale: `compact`, one row per item.
- Numeric: `buttons` when `min`/`max` are set and there are at most 11
  steps (e.g. 0–10); `slider` for larger closed ranges; `input` when the
  range is open.

### 6.3 Never a hidden option

- **Single questions** never need scrolling: `auto` fits them on the
  smallest phone. A researcher who picks a layout that doesn't fit gets a
  warning in the editor.
- **Scales** may scroll: the continue button only works once every item is
  answered, and otherwise scrolls to the first missing item and highlights
  it. So a hidden item can't be skipped unnoticed; no paging.

## 7. Migrating existing codebooks

Published codebooks are immutable JSON, so migration happens on parse, with
a `z.preprocess` on the variable schema (like `migrateLegacyUnitLoop`). The
editor saves the new shape. Nothing is in use yet, so stored answers need no
migration.

| Old | New |
| --- | --- |
| `select_code` | `categorical`, nominal; `vertical: true` → `grid`, 1 column; else `auto` |
| `search_code` | `categorical`, nominal, `dropdown` |
| `scale` with `items` | `scale` |
| `scale` without `items` | `categorical`, ordinal |
| `codes: [{ code, value? }]` | `options`: nominal `{ value: code }`; ordinal `{ value: value ?? position, label: code }` |
| rules conditions | the equivalent simple script |
| `$var.q.code` / `.value` in scripts | not migrated: validation flags them, the author updates them |

## 8. Admin editor

- Type picker: categorical, numeric, scale, confirm, auto (plus span,
  relation in loops).
- An options editor (value, label, colour; ordinal values numeric and rising,
  1..n by default; reordering an ordinal question renumbers on request).
- Categorical: nominal/ordinal toggle; `multiple` (nominal only); layout
  select whose `auto` entry shows the resolved choice; `columns` for a grid.
- Scale: the items editor and the options editor; layout.
- Numeric: min, max, step presets, the break-point labels editor, layout.
- Conditions: the rules mode writes simple scripts with the helpers; the
  script mode shows the helpers in its cheat sheet.
- The live preview renders the question as configured.

## 9. Where it changes

- `contracts`: `variableTypes.ts` (types, options, migration), `codes.ts`
  (options), `answers.ts` (validation), `variableValue.ts` (answer shape),
  `references.ts` and `condition.ts` (value/values, helpers, the simple
  form), a new `layout.ts` (`resolveLayout`), `validation.ts`,
  `CONTRACTS.md`.
- `client`: `CategoricalAnswerField` (replacing the select and search
  fields), `NumericAnswerField`, `ScaleAnswerField` (labels, missing-item
  check); span and relation fields on options; the scope and QuickJS
  prelude with the helper methods; the simple-script evaluator; the
  condition editor; `VariableTypeForm`, the options editor; compact styling.
- `server`: validation comes from contracts; agreement keys on values
  (`codebook.ts`); the demo seed.
- Docs: `client.md` (§3–§5), `CONTRACTS.md`.

## 10. Order of work

1. Contracts: options, types, answer shape, migration, validation,
   `resolveLayout`, references and helpers, the simple-script parser; with
   tests.
2. Client: answer fields and compact styling; scope, helpers, evaluation;
   remove the old fields.
3. Editor: forms, options editor, condition editor on simple scripts.
4. Server: agreement keys, seed, tests.
5. Docs.

## 11. Open questions

1. **`annotinder` (swipe).** Fold it into `categorical` as `layout: "swipe"`
   (at most 3 options, single answer)? Recommendation: yes, once the swipe
   card UI exists; keep the type until then.
2. **Numeric batteries** (a feeling thermometer for several parties, 0–100).
   Recommendation: leave out until a real case asks; `scale` could later
   take a numeric range instead of options.
3. **Scale-level helpers** (e.g. a sum or mean of the items). Not needed
   for conditions so far; advanced scripts can compute them from
   `$var.q.values`.
