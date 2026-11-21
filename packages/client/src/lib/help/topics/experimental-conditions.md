---
title: Experimental conditions
section: Units and distribution
order: 4.5
summary: Experiments with random conditions - how coders get a condition, using it in the design, and giving each condition its own units.
---

A **condition** (such as `control` or `experiment`) is a
[random condition](random-condition.md): drawn when the coder reaches it.
Everyone uses the same link; the draw decides the condition.

## Adding a condition

1. In a **Questions** block: **+** → **Computed variable** → **Random
   condition**.
2. **Item Name**, e.g. `framing` (used as `$var.framing`).
3. **Options**: the values, or **All values in the column** when linked to
   units (below).
4. **Drawn**: **Balanced** (equal groups) or **Random** (independent, as
   most experiments assume; optionally weighted).

Put it first to assign at the start (the [guided setup](setup-wizard.md)
does this), or later, after screening or to balance on earlier answers.

## Using a condition

`$var.framing.is("experiment")` in a [Show if](conditions.md), a
`::: if` in a layout, or an end item's return link.

## Giving each condition its own units

1. Add a set column, say `framing`, with each unit's condition (see
   [Set columns](sets.md)).
2. Under **Linked to units**, choose that column. Loops after the
   condition give each coder the units with their value, plus `_overlap`
   units.

With fixed options, deploying checks that every option occurs in the
column. With **All values in the column**, the column's values are the
options, e.g. 100 sets drawn balanced for a multilevel design.

## Two factors

One condition per factor, each with its own column: `framing` (control,
experiment) and `valence` (positive, neutral, negative). A coder gets the
units matching all their conditions (and their own units, with
[specific coders](own-units.md)). Two clean columns in the results.
