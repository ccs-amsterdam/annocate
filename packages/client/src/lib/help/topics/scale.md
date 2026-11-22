---
title: Scales
section: Question types
order: 4
summary: Several items rated on the same options, such as a Likert battery, in one question.
---

A **Scale** asks coders to rate several **items** on the same ordered
options, on one screen: a Likert battery, or one article rated on how
emotional, balanced and sensational it is. Each item is stored in its own
column.

## Items

Under **Items**, each row has a **name** (stored, e.g. `emotional`;
letters, digits and `_`, unique) and a **label** (shown; empty: the
name). **+ Add item** adds one.

## Options

As for [ordered options](nominal-and-ordinal.md#ordinal-values-are-1-2-3):
labels, rising values, optional colours and special options. A new scale
has five, _Strongly disagree_ to _Strongly agree_.

## Compact or grid

| Layout                              | Coders see                                                         |
| ----------------------------------- | ------------------------------------------------------------------ |
| **Compact** (default, Auto)         | per item a row of value buttons (1 2 3 4 5); end labels above; the chosen button shows its label |
| **Grid (columns)**                  | a table: items as rows, option labels as column heads              |

Compact fits phones and suits a clear range (disagree to agree). Grid
shows every label, but with long labels or many options gets wider than a
phone. See [How answers are laid out](answer-layouts.md).

## Answering

Coders answer the items in any order; the button counts (**3 / 5**) and
continues once all are answered. Clicking it early scrolls to the first
missing item, outlined in red. Number keys answer the first unanswered
item; **Shift + Enter** continues.

> Long batteries tire coders and invite straight-lining. Keep scales
> short, or split them.

## Using the answers

| Reference                          | Gives                      |
| ---------------------------------- | -------------------------- |
| `$var.media.items.emotional.value` | the item's value           |
| `$var.media.items.emotional.label` | its label, e.g. _Agree_    |
| `$var.media.values`                | all item values, as a list |

Conditions compare an item: `$var.interest.items.technology.gte(4)`. The
results have a column per item, `media.emotional`, with a `_label` column.
