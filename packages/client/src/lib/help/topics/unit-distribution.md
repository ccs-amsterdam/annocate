---
title: Handing out units
section: Units and distribution
order: 3
summary: Which units a coder codes - the coder's units, a loop's filter, special units, crowd coding, and the order of units.
---

Two things decide which units a coder gets:

1. **The coder's units**, for the whole study: all units, or their own
   (specific coders) and those of their linked random conditions.
2. **Each unit loop** filters those: all by default, or a part, with
   special units (overlap, practice, gold) placed among them.

## The coder's units

| The design says                                       | A coder gets                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| nothing (a crowd)                                     | all units                                                              |
| **Specific coders** in Coder unit assignments              | their own units (see [Giving each coder their own units](own-units.md)) |
| a random condition **linked to units**                | their condition's units (see [Experimental conditions](experimental-conditions.md)) |
| both                                                  | units matching both                                                    |

`_overlap` units are for everyone. The loop's **Units** tab sums up what a
coder gets.

## A loop's units

On the loop's **Units** tab:

- **All the coder's units** (default).
- **Only those with a value of a set column** / **Except those with a
  value of a set column**: e.g. a `phase` column, a loop for `pre`, some
  questions, a loop for `post`.
- **The coder's own units**: **Include** (default) or **Leave out (only
  special units)**, e.g. for a practice round.

## Crowd coding

With a **Crowd**, tick **Share the units among coders** in **Coder
invitations**: each loop becomes a shared queue, and a unit is handed out
until enough coders coded it (or agree). See [Shared queues](shared-queues.md).

## Overlap, practice and gold units

Each special kind has a row on the **Units** tab: **Spread through them**
(default), **Before them**, **After them** or **Leave out**. See
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
