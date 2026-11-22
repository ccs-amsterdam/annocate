---
title: Random conditions
section: Question types
order: 7
summary: A value drawn when the coder reaches it, without asking - for experiments that assign after a few questions, optionally with its own units.
---

A **random condition** gives every coder a value when they reach it,
without asking: drawn at random or balanced. Use the value like any
answer, to show different questions or texts, or to give each condition
its own units. It is how you run experiments (see
[Experimental conditions](experimental-conditions.md)).

## Adding one

In a questions block, click **+** → **Computed variable** → **Random
condition**. Give it an **Item Name**, e.g. `group`, and **Options** (the
values, with optional labels). It can't go inside a unit loop.

Put it first to assign the condition at the start, or after screening or
background questions to assign later.

## Drawn

| Drawn                                       | The coder gets                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| **Random**                                  | an option at random; **weights** 2 and 1 give about two thirds and one third |
| **Balanced (the value fewest coders have)** | the option fewest coders have so far; ties at random                        |

**Random** is what most experiments assume, but group sizes vary (with 40
coders, 25/15 is quite possible). **Balanced** keeps groups equal; it
counts everyone who reached it, also those who stopped later.

## Balanced within groups

Under **Balance within groups of**, choose earlier questions or
[URL parameters](session-parameters.md): with `gender`, the conditions are
balanced among women and among men; with `session.wave`, per wave. Those
questions must come before it, outside loops.

## Assigned when reached, never changed

The value is drawn when the coder **reaches** the item: after screening,
screened-out coders never get one and don't count in the balance. Once
drawn it never changes (going back, reloading, another device, a new
design version). Changing options or weights only affects coders who
reach it afterwards.

### URL parameter

A value from the link (`?wave=2`) is a [URL parameter](session-parameters.md),
not a random condition: `$session.wave`. It isn't random, so don't use it
for experimental conditions.

## Using the value

Like a single category: `$var.group.value`, `$var.group.label`.

- **Conditions**: `$var.group.is("experiment")` (see [Conditions](conditions.md)).
- **A layout**:

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
answers:
  group: experiment | control
---
::: if $var.group.is("experiment")
> **Note:** this article was written by an AI system.
:::

# $unit.headline

$unit.text
```

- **Units**: under **Linked to units**, choose a set column. Loops after it
  give each coder the units with their value (and `_overlap` units). With
  **All values in the column**, the column's values are the options (e.g.
  100 sets, drawn balanced). See
  [Experimental conditions](experimental-conditions.md).

The values are in `coders.csv` (see [Downloading results](results.md)).
