---
title: Experimental conditions
section: Units and distribution
order: 4.5
summary: Experiments - how coders get a condition, using it in the design, and giving each condition its own units.
---

A **condition** (such as `control` or `treatment`) is assigned by an
[experiment](random-condition.md) item when the coder reaches it.
Everyone uses the same link (**Crowd (one link)**); the draw, or the link's URL
parameter, decides the condition.

## Adding an experiment

1. Outside a loop: **+** → **Experiment**.
2. **Item Name**, e.g. `framing` (used as `$var.framing`).
3. **Assigned**: **Balanced** (equal groups), **At random** (independent,
   as most experiments assume; optionally weighted), or **From a URL
   parameter** (e.g. a panel that sends each group its own link).
4. **Options**: the conditions, unless they come from the units (below).

Put it first to assign at the start, or later, after screening or to balance on earlier answers.

## Using a condition

`$var.framing.is("treatment")` as the condition of a
[branch or unit loop](conditions.md), a `::: if` in a layout, or
an end item's return link. For a whole other layout per condition, put a
layout item in a branch (see [Layout items](layout-templates.md#layout-items)).

## Giving each condition its own units

1. Give the units a **condition set**: a column `condition_set` with each
   unit's condition (see [Coder, condition and part sets](sets.md)), or
   **Make a condition set…** in the experiment's form.
2. Tick **Each condition gets its own units (condition_set)**. Loops after
   the experiment give each coder the units with their condition, plus the
   test units.

With fixed options, deploying checks that every condition has units in
`condition_set`. With **The conditions are condition_set's values**, its
values are the conditions, e.g. 100 sets drawn balanced for a multilevel
design.

One experiment at most gives its conditions their own units, and only
with **Crowd (one link)** (expert coders get the units of their coder set).

## Conditions from a URL parameter

Declare a [URL parameter](session-parameters.md) with a list of values
(the conditions), e.g. `arm` with `control` and `treatment`. In the
experiment, **Assigned: From a URL parameter** and choose it. A coder's
condition is their link's value (`?arm=treatment`); nothing is drawn.

## Two factors

One experiment per factor: `framing` (control, treatment) and `valence`
(positive, neutral, negative), each its own column in the results. Only
one of them can select units; for units per combination, make one
experiment with the combinations as conditions (`control_positive`, ...).
