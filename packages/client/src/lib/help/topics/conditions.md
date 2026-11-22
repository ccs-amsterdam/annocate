---
title: Blocks and conditions
section: Editor
order: 4
summary: Group items in blocks, and show a block (or its else items) or a unit loop only when earlier answers (or the unit) say so.
---

A **block** holds items, and optionally a **label** (e.g.
_Demographics_) and a **condition**. Without a condition it is always
shown; with one, only when the condition holds. Otherwise the coder gets
its **else items**, if it has any, or skips to what comes after it.

A block works the same at the top level, inside another block or inside a
unit loop:

```text
Unit loop
  Topic                   categories: politics, economy, sports, ...
  if topic is "politics"
    ├ Actors              mark text: the politicians mentioned
    └ Party               categories: ...
  Else
    └ Main actor          short text
  Tone                    asked for every unit
```

## Adding a block

1. At the top level: **Add item** above the tree → **Block (if/else)**.
   Inside a block or loop: click **+** and choose **Block (if/else)** (see
   [The design editor](design-editor.md#adding-items)).
2. Optionally fill in **Label (optional)**, e.g. _Demographics_ (shown
   in the tree).
3. To make it conditional, tick **Only show these questions if…** and set
   the rules.
4. Add items inside it, or move existing ones in. A new block starts
   empty.

It can hold questions, computed variables (outside loops), other blocks
and [end items](end-items.md). A unit loop can't go inside a block: give
the loop a condition instead (see [Loop conditions](#loop-conditions)).

## Else items

A block with a condition can also have items shown when the condition
doesn't hold. Click **Add else items** on the block's row: this adds an
**Else** part, under the block's items, with a first question. Only a
block with a condition can have else items.

## Loop conditions

A unit loop can have a condition too: tick **Only give coders this loop
if…** in the loop's form. Coders get the loop only if it holds. It can use
answers given before the loop (`$var`), not the unit's data (`$unit`).

## The rules editor

With **Rules** selected, each row is a question, an operator and a value.
**+ Rule** adds a row. With several rows, choose **All rules must hold**
(and) or **Any rule may hold** (or). Only questions answered before the
condition are listed, and values come from their options.

| Question                                     | Operators                                                 |
| -------------------------------------------- | --------------------------------------------------------- |
| Categories (one answer), swipe, random       | is, is not, is one of, is none of                         |
| Ordered options, a scale item                | the same, and >, ≥, <, ≤                                  |
| Number                                       | =, ≠, >, ≥, <, ≤, between                                 |
| Categories with multiple answers             | has, doesn't have, has any of, has none of, has all of, count ≥, count ≤ |
| Mark text, relation                          | has, doesn't have, count ≥, count ≤                       |
| Confirm, a whole scale                       | is answered, is not answered                              |

Every question also has **is answered** / **is not answered**.

> "Not" rules (_is not_, _is none of_, _≠_) also hold when the question
> wasn't answered. If that matters, add _is answered_ with **All rules
> must hold**.

## Script mode

**Script** shows the condition as a script, and lets you write what rules
can't: a mix of and/or, or unit data.

```text
$var.topic.is("politics")
$var.age.gte(18) && $var.consent.answered
$var.consent.answered && ($var.age.lt(18) || $var.country.is("other"))
$unit.source === "blog"
!$var.group.is("control")
```

A script of rules joined all by `&&` or all by `||` switches back to
**Rules**. **References and helpers you can use here** lists what fits;
click one to add it. See also [Scripts](scripts.md).

## Helper methods

| Method                | Works on                                       | Holds when the answer ...       |
| --------------------- | ---------------------------------------------- | ------------------------------- |
| `is(v)`, `isAny(...)` | one answer (categories, ordered, swipe, random, scale item) | is `v` / one of them |
| `gt(n)`, `gte(n)`     | ordered, number, scale item                    | is above (or equal to) `n`      |
| `lt(n)`, `lte(n)`     | ordered, number, scale item                    | is below (or equal to) `n`      |
| `eq(n)`               | number                                         | equals `n`                      |
| `between(a, b)`       | number                                         | is from `a` to `b`, inclusive   |
| `has(v)`              | multiple answers, span, relation               | includes `v`                    |
| `hasAny(...)`, `hasAll(...)` | multiple answers                        | includes one / all of them      |
| `count()`             | multiple answers, span, relation               | the number of answers           |

- Helpers compare **values**, not labels: `is("human_interest")`. See
  [Values and labels](references.md#values-and-labels).
- Ordered values are numbers: `is(2)`, not `is("2")`.
- Helpers are false while unanswered (`count()` is 0).
- A scale item: `$var.trust.items.media.gte(4)`.

## Questions a condition skips

A skipped question counts as **unanswered** for what follows. In a loop it
is stored as _skipped_ and empty in the results; a unit is finished when
every question is answered or skipped. Conditions are checked again when
the coder moves on, so changing an earlier answer can show or skip later
questions.

## Inside and outside a loop

- **Outside** a loop: about the coder (screening, consent, groups). To
  skip a whole loop, give the loop a condition.
- **Inside** a loop: checked per unit, with this unit's earlier answers
  and its data (in script mode: `$unit.lang === "nl"`).

## Conditions in a layout or text

To show part of a layout or text only in some cases, write a `::: if`
block; no block item needed:

```example
answers:
  group: experiment | control
---
::: if $var.group.is("experiment")
**Note:** this article was flagged by fact-checkers.
:::

Read the article and answer the questions below.
```

See [Showing parts conditionally](template-blocks.md). Which units a coder
gets is set by the loop's units, not by conditions (see
[Handing out units](unit-distribution.md)).
