---
title: Handing out units
section: Units and distribution
order: 3
summary: Which units a coder codes - the coder's units, a loop's subset, special units, crowd coding, and the order of units.
---

Two things decide which units a coder gets:

1. **The coder's units**, for the whole study: all units, their own
   (specific coders), or their link's set (a crowd with a link per set),
   and those of their linked random conditions.
2. **Each unit loop** selects from those: all by default, or a subset,
   with special units (overlap, practice, gold) placed among them.

## The coder's units

| The design says                                       | A coder gets                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| nothing (a crowd)                                     | all units                                                              |
| a **Crowd** with a set column of only special units   | all units outside the special sets                                     |
| a **Crowd** with a link per set                       | their link's set (units without a value aren't coded)                  |
| **Specific coders** in Coder unit assignments              | their own units (see [Giving each coder their own units](own-units.md)) |
| a random condition **linked to units**                | their condition's units (see [Experimental conditions](experimental-conditions.md)) |
| both                                                  | units matching both                                                    |

The special units (`_overlap`, `_practice`, `_gold`) of the coder unit
assignment's column are for everyone. The loop's form sums up what a
coder gets.

## A loop's units

Select the loop:

- **Select unit subset(s)**: **All the coder's units** (default), or a
  set column and the **Sets to include**: e.g. a `phase` column, a loop
  for `pre`, some questions, a loop for `post`. The coder unit
  assignment's column can't be used here.
- **Coding units**: **Include** (default) or **Leave out (only special
  units)**, e.g. for a practice round.
- In a later loop, **Coding units: The units each coder got in the
  previous loop**: the units each coder finished there, in that order, e.g.
  a second round of questions on the same units. They are fixed when the
  coder reaches the loop.

## Crowd coding

With a **Crowd**, select a loop and choose **Divide units among
coders**: the loop becomes a shared queue, and a unit is handed out
until enough coders coded it (or agree). See [Shared queues](shared-queues.md).

## Overlap, practice and gold units

Special units come only from the coder unit assignment's column; without
one there are none. Each special kind has a row in the loop's form:
**Spread throughout** (default), **Before coding units**, **After coding
units** or **Leave out** (not available when the column has none). See
[Overlap](overlap.md) and [Overlap, gold and practice units](special-units.md).

## Order

| Order                                   | Coders get                                       |
| --------------------------------------- | ------------------------------------------------ |
| **In set order**                        | the set's order (or upload order), the same for all |
| **Random (each coder their own order)** | their own random order, kept across reloads      |

**Random** is safer for most content analysis: fatigue and learning
average out. **In set order** when order matters (a thread, easy to
hard); set it with `#` in a set column (`anna#1`, `anna#2`). In a shared
queue, priority comes first.

## When coders run out

A coder with no units left in a loop continues with what comes after it.

> Check the distribution in **Preview**: it uses your draft units, stores
> nothing and doesn't use up a shared queue.
