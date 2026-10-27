---
title: Scales
section: Question types
order: 4
summary: Several items rated on the same options, such as a Likert battery, in one question.
---

A **Scale (items on the same options)** question asks coders to rate
several **items** on the same ordered options, all on one screen. It is the
familiar Likert battery from surveys (*How much do you agree with each of
these statements?*), and it works just as well for content analysis: rate
one article on how emotional, how balanced and how sensational it is.

Each item is answered on its own, and stored in its own column, so a scale
is really several ordinal questions that share their options and their
screen.

## Items

Under **Items**, each row is one item:

- **name**: how the item is stored and referred to, e.g. `emotional`. Use
  letters, numbers and `_`. Each name must be unique within the scale.
- **label**: what coders see, e.g. *The article appeals to emotions*. If you
  leave it empty, coders see the name, with spaces for the `_`.

Click **+ Add item** to add an item, and the cross to remove one. A scale
needs at least one item.

## Options

The **Options** work exactly as for an
[ordinal question](nominal-and-ordinal.md#ordinal-values-are-1-2-3):
a label coders see, a value that rises with the order (1, 2, 3, ... or your
own with **Custom values**), and an optional colour. A new scale starts with
five options from *Strongly disagree* to *Strongly agree*.

## Compact or grid

Under **Layout**:

| Layout | Coders see |
| --- | --- |
| **Compact (values; the selected one shows its label)**: the default, also what **Auto** picks | each item's label, with a row of buttons under it showing the values (1 2 3 4 5); the labels of the first and last option above the items. The chosen button grows and shows its label |
| **Grid (columns)** | a table: the items as rows, the option labels as column heads, and a round button in every cell |

**Compact** is made for phones: each item takes one short row, however
long the option labels are. Coders see the full labels only for the two
ends and for the option they chose, so it works best when the options are
a clear range, such as disagree to agree.

**Grid** shows every label all the time, as in a paper questionnaire. With
long labels or many options the table gets wider than a phone screen, and
coders have to scroll sideways. Use it for coders on larger screens, or
with short labels.

The layout is fixed per question: every coder sees the same form,
whatever their device. See [How answers are laid out](answer-layouts.md).

## Answering

Coders choose an option for each item, in any order. The button under the
items shows how many they have done, such as **3 / 5**, and turns into a
continue button once all items have an answer.

If a coder clicks it before answering every item, the first missing item
is scrolled into view and outlined in red, so coders don't need to hunt
for it. A scale is only answered when all items are.

With a keyboard, the number keys **1** to **9** answer the first item that
has no answer yet, so coders can go down the list with the number keys
alone; **Enter** continues.

> Long batteries are tiring and invite straight-lining (the same answer for
> every item). Keep scales short, and split a long battery into two
> questions if you need to.

## Using the answers

Each item can be referred to on its own:

| Reference | Gives |
| --- | --- |
| `$var.media.items.emotional.value` | the value of the item `emotional` |
| `$var.media.items.emotional.label` | its label, e.g. *Agree* |
| `$var.media.values` | all item values, as a list |

In conditions, compare an item, not the whole scale: for example
`$var.interest.items.technology.gte(4)` shows a follow-up question only to
coders who rated their interest in technology 4 or higher. Items take the
same comparisons as ordinal questions. See [Conditions](conditions.md).

In the results, every item has its own column, named
`question.item` (such as `media.emotional`), with a `_label` column next to
it (unless you untick **Add label columns**). See [Downloading results](results.md).
