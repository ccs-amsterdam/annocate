---
title: Experimental conditions
section: Units and distribution
order: 4.5
summary: Experiments with random conditions - how coders get a condition, using it in the design, and giving each condition its own units.
---

A **condition** is a value a coder's session gets, such as `control` or
`experiment`, which the design uses to show different questions, texts or
units. In AnnoTinder a condition is a **random condition**: a computed item
in the tree, drawn when the coder reaches it (see
[Random conditions](random-condition.md)). Everyone uses the same link; the
draw decides who gets which condition.

## Adding a condition

In a **Questions** block of the tree, add an item with **+**, choose
**Computed variable** and then **Random condition**:

- **Item Name**, such as `framing`: the design uses it as `$var.framing`.
- **Options**: the values (`control`, `experiment`), or, when it is linked
  to units, **All values in the column** (below).
- **Drawn**:

| Choice                                      | Who gets which value                    |
| ------------------------------------------- | --------------------------------------- |
| **Balanced (the value fewest coders have)** | the value with the fewest coders so far |
| **Random**                                  | a random value (optionally weighted)    |

**Balanced** keeps groups equal. **Random** gives every coder the same
chance, as most experiments assume.

Put the condition first in the design to assign it when the coder starts
(the [setup wizard](setup-wizard.md) does this), or after some questions to
assign it later: after a screening, or to balance groups on earlier answers
(stratified).

## Using a condition

In any condition or script: `$var.framing.is("experiment")`. Use it in a
[Show if](conditions.md) to show other questions or texts, or in an end
item's return link.

## Giving each condition its own units

Link the condition to a set column of your units, under **Linked to
units**. The loops after it then only give a coder the units whose cell
holds their value: the `experiment` coders the units marked `experiment`.
Units in `_overlap` are for every condition.

1. Add a set column to your units, say `framing`, with each unit's
   condition (see [Set columns](sets.md)).
2. Link the condition to it. With fixed options, deploying checks that
   every option occurs in the column. With **All values in the column**, the values are
   whatever the column holds: for instance 100 sets for a multilevel
   design, drawn balanced over coders.

## Two factors (cross-nested)

Use a condition per factor, each with its own column: `framing` (control,
experiment) and `valence` (positive, neutral, negative). A coder's units
are those matching all their linked conditions, and their own units, if the
study invites [specific coders](own-units.md). Separate conditions are also
easier to analyse: two clean columns in the results.
