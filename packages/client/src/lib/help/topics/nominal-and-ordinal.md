---
title: Categories: nominal and ordinal
section: Question types
order: 2
summary: Questions where coders pick from a list of options - with or without an order.
---

- **Categories** (nominal): options without an order: topics, actors,
  genres, yes/no. One answer, or several if you allow it.
- **Ordered options** (ordinal): options from low to high: tone,
  prominence, agreement. One answer.

## Options

| Column             | What it is                                                     |
| ------------------ | -------------------------------------------------------------- |
| **Label (shown)**  | what coders see, e.g. _Human interest_                         |
| **Value (stored)** | what is saved and exported, e.g. `human_interest`              |
| **Color**          | optional: a swatch opens a palette, **Any colour** or **None** |

**+ Add option** adds one; the arrows move it, the cross removes it. Coders
see them in this order.

Labels can be reworded any time; values are what your analysis and
[conditions](conditions.md) use, so change a value only for a different
category. See [Values and labels](design-values-and-labels.md).

### Nominal values follow the label

While you type a label, the value follows: lower case, `_` for spaces, no
accents (_Économie_ → `economie`). Edit a value by hand to use your own
codes; it then stops following. Values must be unique and not empty.

### Numeric values

Nominal values can be numbers, e.g. an existing codebook's codes (1 =
_Politics_, 99 = _Other_).

- If all values are plain numbers, exports type them as numbers (a leading
  zero such as `01` keeps them all text).
- `$var.topic.is(2)` and `is("2")` both match.
- They are codes, not amounts: no _greater than_. Use ordered options if
  the order matters.

Text values such as `economy` are harder to mix up; prefer them.

### Ordinal values are 1, 2, 3, ...

Ordered options get 1, 2, 3, ... in their order, renumbered when you
change the list. Tick **Custom values** for other numbers (`-2 … 2`,
`0, 25, 50`); they must still rise.

### Colours

A colour helps coders find an option (red negative, green positive). Use
few: if everything is bright, nothing stands out. The palette's colours
read well in light and dark mode; **Any colour** opens the browser's own
picker. In the JSON a colour is a CSS colour name (`seagreen`, `crimson`)
or a hex code (`#22c55e`); the picker's colours are names.

### Special answers

For answers outside the options, choose **+ Add special option** next to
**+ Add option**; the answer appears in a row under the options:

| Special answer     | Keys    | For example                                     |
| ------------------ | ------- | ----------------------------------------------- |
| **Don't know**     | **/ 8** | "Don't know", "Can't tell", "Prefer not to say" |
| **Not applicable** | **/ 9** | "Not applicable", "Doesn't mention it", "None"  |

The label is yours. They are shown in a row under the options, in a
quieter style. Coders can choose them with the leader key **/** and then
**8** or **9**, in every question (the codes surveys use for don't know are
8 and 88). With several answers, a
special answer is the only answer.

A special answer has no value by default: it is stored as missing, and the
results say which (a `.special` column in the download). Give it a
**code** to store one instead, e.g. `99` (ordered questions: a number that
isn't one of the options' values; categories: text). Numbers and scales
have them too; swipe doesn't.

## Options from data

A category question can also offer options that differ per unit. Choose
**+ Options from data…** under the options:

- **A unit's list field** (see [list fields](uploading-units.md#types)):
  its items. The label is shown; the value is the item's own, or made
  from the label (`Mark Rutte` → `mark_rutte`).
- **The spans of an earlier span question** in the same loop: one option
  per span the coder marked, with its text and its label's colour. The
  value is the span's id, so the answer links to that exact span in the
  download (`.json` columns).

They appear as one fixed row among the options: move it to put them
before, between or after the question's own options (e.g. _None of
these_ last). Conditions can't check these values ahead (they differ per
unit), and the download shows them as values.

## Several answers

Tick **Allow several answers** (categories only). Coders tick options and
click **Continue**. Answers are stored in option order, joined with `; `
in the results; in references they are a list (`$var.topics.values`,
`$var.topics.has("economy")`). For several ordered ratings, use a
[scale](scale.md).

## How the options are laid out

| Layout                   | Categories | Ordered | Shows                                           |
| ------------------------ | ---------- | ------- | ----------------------------------------------- |
| **Row (one row)**        | yes        | yes     | buttons side by side                            |
| **Grid (columns)**       | yes        | yes     | buttons in 1 to 4 **Columns**                   |
| **Flex (buttons wrap)**  | yes        |         | buttons that wrap                               |
| **Compact**              |            | yes     | small buttons with the values, end labels above |
| **Dropdown with filter** | yes        | yes     | a list; coders type to filter                   |

**Auto** shows its choice, e.g. _Auto (Grid, 2 columns)_. See
[How answers are laid out](answer-layouts.md).

## Keys

Coders press **1** to **9** for the options (or the keys they chose, see
[Keyboard shortcuts](coder-experience.md#keyboard-shortcuts)), **/ 8**, **/ 9**
for special answers. With several answers a key ticks or unticks.

## Switching between nominal and ordinal

Click **Change type** and pick the other; the options are kept:

- **To ordered**: same order and labels, values 1, 2, 3, ...
- **To categories**: values made from the labels (_Very negative_ →
  `very_negative`).

**Allow several answers** is turned off. Do it before coding starts.

## Using the answers

`$var.topic.value`, `$var.topic.label`, or for several answers
`$var.topics.values` / `.labels`. Ordered answers also compare:
`$var.tone.gte(4)`. The results have a column of values and, with **Add
label columns**, a `.label` column. See [Downloading results](results.md).
