---
title: Experiments
section: Question types
order: 7
summary: An item that assigns each coder one of its conditions when they reach it, without asking - drawn at random or balanced, or from a URL parameter, optionally with its own units per condition.
---

An **experiment** gives every coder one of its **conditions** when they
reach it, without asking: drawn at random or balanced, or taken from a URL
parameter of the link. Use the condition
like any answer, to show different questions or texts, or to give each
condition its own units (see
[Experimental conditions](experimental-conditions.md)).

## Adding one

Outside a unit loop, click **+** → **Experiment**. Give it an **Item
Name**, e.g. `group`, and **Options** (the conditions, with optional
labels). It can't go inside a unit loop.

Put it first to assign the condition at the start, or after screening or
background questions to assign later.

## Assigned

| Assigned                                    | The coder gets                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **At random**                               | a condition at random; **weights** 2 and 1 give about two thirds and one third                                   |
| **Balanced (the value fewest coders have)** | the condition fewest coders have so far; ties at random                                                          |
| **From a URL parameter**                    | their link's value of a [URL parameter](session-parameters.md) whose values are the conditions; nothing is drawn |

**At random** is what most experiments assume, but group sizes vary (with 40
coders, 25/15 is quite possible). **Balanced** keeps groups equal; it
counts everyone who reached it, also those who stopped later.

## Balanced within groups

With **Balanced**, under **Balance within groups of**, choose earlier questions or
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

A value from the link (`?wave=2`) is a [URL parameter](session-parameters.md):
`$session.wave`. To make it the experiment's condition (e.g. a panel that
assigns the groups and sends each its own link), list its values (the
conditions) in the Study entry and choose **Assigned: From a URL
parameter**. It isn't random: the randomisation is then the panel's.

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

- **Units**: tick **Each condition gets its own units (condition_set)**.
  Loops after it give each coder the units with their condition in the
  units' `condition_set` (and the test units). With **The conditions are
  condition_set's values**, its values are the conditions (e.g. 100 sets,
  drawn balanced). See
  [Experimental conditions](experimental-conditions.md).

The conditions are in `sessions.csv` (see [Downloading results](results.md)).
