---
title: Unit loops
section: Unit layouts
order: 1
summary: Questions that are asked once for every unit - how a loop works, how it shows units, and where you set its units.
---

A **unit loop** asks its questions for every unit a coder gets: the first
unit with its questions, then the next, until the coder's units are done.
Questions asked once per coder go before or after the loop.

## Adding a loop

1. Click **Add item** above the tree → **Unit loop**.
2. Optionally give it a **Label**, e.g. _News items_ (shown in the tree,
   the coders' menu and the `loop` column of `variables.csv`).
3. A new loop starts with a **Unit layout** item: select it to set how
   units are shown.
4. Add questions with **+** → **Inside** the loop.

## How units are shown

A **Unit layout** item shows the unit for the questions after it, until
the next layout item. A loop can have several, or none: questions before
any layout are asked without the unit. See
[Layout templates](layout-templates.md#layout-items).

## The loop's units

Select the loop to set which units it codes, their **Order**, and special
units. See [Handing out units](unit-distribution.md).

## Questions inside a loop

Each is answered per unit: a row per unit and coder in
`annotations.csv`. Inside a loop, texts and conditions can also use the
unit's data (`$unit.headline`) and earlier answers for the same unit.
[Mark text](span.md) and [relations](relation.md) only work in loops;
[experiments](random-condition.md) only outside.

A loop's answers stay in the loop: another loop can't use them. Loops
can't be nested.

## Questions before the loop

Answers given before the loop can be used everywhere in it, e.g. an
experimental group that changes how units are shown:

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
answers:
  role: student | journalist | -
---
::: if $var.role.answered
*You code as a $var.role.label.*
:::

# $unit.headline

$unit.text
```

## Several loops

Use several loops for parts that work differently: a **training** loop
then the **main** loop, headlines then full articles, or units, survey
questions, and units again. Coders go through them in order.

## Order of units

By default the set's order (all units: upload order). **Order** →
**Random (each coder their own order)** averages out order effects. See
[Order](unit-distribution.md#order).

Try a new loop in **Preview** before sending the link. See
[What coders see](coder-experience.md).
