---
title: Experimental conditions
section: Units and distribution
order: 4.5
summary: Experiments - how coders get a condition, using it in the design, and giving each condition its own units.
---

A **condition** (such as `control` or `treatment`) is assigned by an
[experiment](random-condition.md) item when the coder reaches it.
Everyone uses the same link; the draw decides the condition.

## Adding an experiment

1. Outside a loop: **+** → **Experiment**.
2. **Item Name**, e.g. `framing` (used as `$var.framing`).
3. **Options**: the conditions, or **All values in the column** when
   linked to units (below).
4. **Drawn**: **Balanced** (equal groups) or **Random** (independent, as
   most experiments assume; optionally weighted).

Put it first to assign at the start (the [guided setup](setup-wizard.md)
does this), or later, after screening or to balance on earlier answers.

## Using a condition

`$var.framing.is("treatment")` as the condition of a
[block or unit loop](conditions.md), a `::: if` in a layout, or
an end item's return link. For a whole other layout per condition, put a
layout item in a block (see [Layout items](layout-templates.md#layout-items)).

## Giving each condition its own units

1. Add a set column, say `framing`, with each unit's condition (see
   [Set columns](sets.md)).
2. Under **Linked to units**, choose that column. Loops after the
   experiment give each coder the units with their condition, plus
   `_overlap` units.

With fixed options, deploying checks that every condition occurs in the
column. With **All values in the column**, the column's values are the
conditions, e.g. 100 sets drawn balanced for a multilevel design.

## Two factors

One experiment per factor, each with its own column: `framing` (control,
treatment) and `valence` (positive, neutral, negative). A coder gets the
units matching all their conditions (and their own units, with
[specific coders](own-units.md)). Two clean columns in the results.
