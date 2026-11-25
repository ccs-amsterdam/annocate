---
title: Handing out units
section: Units and distribution
order: 3
summary: Which units a coder codes - the coder's units, a loop's part, test units, crowd coding, and the order of units.
---

Two things decide which units a coder gets:

1. **The coder's units**, for the whole study: all units, their own
   (expert coders, `coder_set`), and their condition's (an experiment
   that gives each condition its own units, `condition_set`).
2. **Each unit loop** selects from those: all by default, or one part
   (`part_set`), with the test units (overlap, practice, gold) placed among
   them.

## The coder's units

| The design says                                           | A coder gets                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Crowd (one link)**                                      | all units                                                                                                     |
| **Expert coders** in Who codes                            | the units with their coder id in `coder_set` (see [Giving each coder their own units](own-units.md))              |
| an experiment where **each condition gets its own units** | the units with their condition in `condition_set` (see [Experimental conditions](experimental-conditions.md)) |

Test units (`test_set`) are for everyone, besides these. The loop's form
sums up what a coder gets.

## A loop's units

Select the loop:

- **Part**: **All units** (default), or one value of the units'
  `part_set`: e.g. a loop for `pre`, some questions, a loop for `post`.
  Without a part set, **Make a part set…** makes one. A test unit with a
  part is only in that part's loops; without one, in every loop.
- **Coding units**: **Include** (default) or **Leave out (only test
  units)**, e.g. for a practice round.
- In a later loop, **Coding units: The units each coder got in the
  previous loop**: the units each coder finished there, in that order, e.g.
  a second round of questions on the same units. They are fixed when the
  coder reaches the loop.

## Crowd coding

With **Crowd (one link)**, select a loop and choose **Divide units among
coders**: the loop becomes a shared queue, and a unit is handed out
until enough coders coded it (or agree). See [Shared queues](shared-queues.md).

## Overlap, practice and gold units

Test units come from the units' `test_set`. Each type has a row in the
loop's form, under **Test units** (folded): **Spread throughout**
(default), **Before coding units**, **After coding units** or **Leave out** (not available when the units have
none). See [Overlap](overlap.md) and
[Overlap, gold and practice units](special-units.md).

## Order

Under **Order** (folded) in the loop's form:

| Order                                   | Coders get                                          |
| --------------------------------------- | --------------------------------------------------- |
| **In set order**                        | the set's order (or upload order), the same for all |
| **Random (each coder their own order)** | their own random order, kept across reloads         |

**Random** is safer for most content analysis: fatigue and learning
average out. **In set order** when order matters (a thread, easy to
hard); set it with `#` in a role column (`anna#1`, `anna#2` in
`coder_set`). In a shared queue, priority comes first.

## When coders run out

A coder with no units left in a loop continues with what comes after it.

> Check the distribution in **Preview**: it uses your draft units, stores
> nothing and doesn't use up a shared queue.
