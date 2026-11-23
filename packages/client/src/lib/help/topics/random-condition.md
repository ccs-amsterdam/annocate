---
title: Experiments
section: Question types
order: 7
summary: An item that assigns each coder one of its conditions when they reach it, without asking - drawn at random or balanced, optionally with its own units per condition.
---

An **experiment** gives every coder one of its **conditions** when they
reach it, without asking: drawn at random or balanced. Use the condition
like any answer, to show different questions or texts, or to give each
condition its own units (see
[Experimental conditions](experimental-conditions.md)).

## Adding one

Outside a unit loop, click **+** → **Experiment**. Give it an **Item
Name**, e.g. `group`, and **Options** (the conditions, with optional
labels). It can't go inside a unit loop.

Put it first to assign the condition at the start, or after screening or
background questions to assign later.

## Drawn

| Drawn                                       | The coder gets                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| **Random**                                  | a condition at random; **weights** 2 and 1 give about two thirds and one third |
| **Balanced (the value fewest coders have)** | the condition fewest coders have so far; ties at random |

**Random** is what most experiments assume, but group sizes vary (with 40
coders, 25/15 is quite possible). **Balanced** keeps groups equal; it
counts everyone who reached it, also those who stopped later.

## Balanced within groups

Under **Balance within groups of**, choose earlier questions or
[URL parameters](session-parameters.md): with `gender`, the conditions are
balanced among women and among men; with `session.wave`, per wave. Those
questions must come before it, outside loops.

## Assigned when reached, never changed

The condition is drawn when the coder **reaches** the item: after
screening, screened-out coders never get one and don't count in the
balance. Once assigned it never changes (going back, reloading, another device, a new
design version). Changing options or weights only affects coders who
reach it afterwards.

### URL parameter

A value from the link (`?wave=2`) is a [URL parameter](session-parameters.md),
not an experiment: `$session.wave`. It isn't random, so don't use it
for experimental conditions.

## Using the condition

Like a single category: `$var.group.value`, `$var.group.label`.

- **Conditions**: `$var.group.is("treatment")` (see [Conditions](conditions.md)).
- **A layout**:

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
answers:
  group: treatment | control
---
::: if $var.group.is("treatment")
> **Note:** this article was written by an AI system.
:::

# $unit.headline

$unit.text
```

- **Units**: under **Linked to units**, choose a set column. Loops after it
  give each coder the units with their condition (and `_overlap` units).
  With **All values in the column**, the column's values are the
  conditions (e.g. 100 sets, drawn balanced). See
  [Experimental conditions](experimental-conditions.md).

The conditions are in `coders.csv` (see [Downloading results](results.md)).
