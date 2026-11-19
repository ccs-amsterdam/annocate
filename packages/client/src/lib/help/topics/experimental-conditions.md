---
title: Experimental conditions
section: Units and distribution
order: 4.5
summary: Assigned and random conditions - how coders get a condition, using it in the design, and giving each condition its own units.
---

A **condition** is a value a coder's session gets, such as `control` or
`experiment`, which the design uses to show different questions, texts or
units. There are two kinds, which differ in *when* the value is set:

| | Set | Defined in | Use it as |
| --- | --- | --- | --- |
| **Assigned condition** | When the session starts: by the link, or drawn | **Session**, above the item tree | `$session.<name>` |
| **Random condition** | When the coder reaches it in the flow: drawn | an item in the tree ([Random conditions](random-condition.md)) | `$var.<name>` |

## Assigned conditions

In the editor, open **Session** and add a condition under **Assigned
conditions**:

- **Name**, such as `framing`: the design uses it as `$session.framing`.
- **Values**: a list (`control`, `experiment`), or **All values in the
  column** when it is linked to units (below).
- **How it is assigned**:

| Choice | Links | Who gets which value |
| --- | --- | --- |
| **By link: a link per value** | one per value | you, by who you send which link |
| **At the start: one link, balanced** | one | the value with the fewest sessions so far |
| **At the start: one link, random** | one | a random value |

**Balanced** keeps groups equal: it counts finished sessions and sessions
active in the last 24 hours, so someone who drops out doesn't hold a place.
**Random** gives every session the same chance, as most experiments assume.

## Random conditions

A random condition is assigned when the coder reaches it, so you can ask
questions first: background questions, a pre-test, or to balance groups on
earlier answers (stratified). See [Random conditions](random-condition.md).

## Using a condition

In any condition or script: `$session.framing.is("experiment")` (or
`$var.framing` for a random condition). Use it in a
[Show if](conditions.md) to show other questions or texts, in a loop's
[coder groups](coder-groups.md), or in an end item's return link.

## Giving each condition its own units

Link the condition to a set column of your units, under **Linked to
units**. A session then only gets the units whose cell holds its value: the
`experiment` sessions the units marked `experiment`. Units in `_overlap`
are for every condition.

1. Add a set column to your units, say `framing`, with each unit's
   condition (see [Set columns](sets.md)).
2. Link the condition to it. With fixed values, deploying checks that
   every value occurs in the column. With **All values in the column**,
   the values are whatever the column holds: for instance 100 sets for a
   multilevel design, drawn balanced over coders.

A random condition can be linked the same way; the loops after it in the
flow then get its units.

## Two factors (cross-nested)

Use a condition per factor, each with its own column: `framing` (control,
experiment) and `valence` (positive, neutral, negative). A session's units
are those matching all its linked conditions, and its coder, if units are
[divided over coders](own-units.md). Separate conditions are also easier to
analyse: two clean columns in the results.
