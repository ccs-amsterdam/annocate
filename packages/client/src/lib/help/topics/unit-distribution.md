---
title: Handing out units
section: Units and distribution
order: 3
summary: Which units a coder codes - the coder's units, a loop's filter, special units, crowd coding, and the order of units.
---

Two things decide which units a coder gets:

1. **The coder's units**, decided for the whole study: all units, or,
   when the design divides them, the coder's own units (with specific
   coders) and those of their linked random conditions.
2. **Each unit loop** works within those, like a filter: all of them by
   default, or a part, with the special units (overlap, practice, gold)
   placed among them. With a crowd that shares the units, each loop hands
   them out as a shared queue.

A loop doesn't decide _who_ gets which units: that is in the design's
**Coder invitations** and in your [set columns](sets.md).

## The coder's units

| The design says                                                | A coder gets                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| nothing (a crowd)                                              | all units                                                                                |
| **Specific coders** in the Coder invitations (column `coders`) | their own units (see [Giving each coder their own units](own-units.md))                  |
| a random condition **linked to units** (column `framing`)      | the units of their condition (see [Experimental conditions](experimental-conditions.md)) |
| both                                                           | the units that match both                                                                |

Units in a column's `_overlap` are for everyone. The loop's **Units** tab
says in one line what a coder gets.

## A loop's units

On the loop's **Units** tab:

- **All the coder's units** (the default): every coder codes all of
  them, once.
- **Only those with a value of a set column**, or **Except those with a
  value of a set column**: pick the column and the values. Two loops can
  then split the units, for instance a `phase` column with `pre` and `post`:
  the first loop codes `pre`, then come some questions, then a second loop
  codes `post`. Or: first a loop with only the `_overlap` units, then one
  with the rest.
- **The coder's own units**: **Include** (the default), or **Leave out
  (only special units)**, for a loop with only the overlap, practice or
  gold units, such as a practice round before the real coding.

## Crowd coding

With a crowd invitation, tick **Share the units among coders** (in **Coder
invitations**) to make every loop a shared queue: coders who get the same
units draw from one queue, and a unit is handed out until enough coders
coded it (or agree on a question), then to no one else. Use it when coders
come and go and each unit needs, say, two codings. The settings (coders per
unit, agreement, units per coder) are explained in
[Shared queues](shared-queues.md).

## Overlap, practice and gold units

A loop places the special units of the set columns among the coder's own
units. Each has a row on the **Units** tab with its count and where it
goes: **Spread through them** (the default), **Before them**, **After
them** or **Leave out**. In a shared queue without a maximum of units per
coder, spread means about one in ten, at random. See [Overlap](overlap.md)
and [Overlap, gold and practice units](special-units.md).

## Order

Under **Order** you choose in which order a coder gets their units:

| Order                                   | What coders get                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **In set order**                        | The units in the order of their set (or the order they were uploaded). Every coder gets the same order. |
| **Random (each coder their own order)** | Every coder gets the units in their own random order.                                                   |

A random order is fixed per coder: after a reload, or the next day, they
continue in the same order.

- **Random** is the safer choice for most content analyses. Coders get
  tired and learn as they go: in a fixed order the same units always come
  first and last, which can bias the results. In a survey experiment,
  random order counterbalances the order of the stimuli.
- **In set order** is right when the order matters: units that tell a
  story, a thread of messages, a training set from easy to hard. You set the
  order with `#` in a set column (`anna#1`, `anna#2`).

In a shared queue, the queue's priority comes first, and the order decides
among units that are equally far.

## Different units for different coders

A loop has one set of settings for everyone. Which units a coder gets
differs by coder: their own units with specific coders, and the
[random conditions](random-condition.md) linked to a unit column.

## What coders see when they run out

A coder who has no units left in a loop continues with whatever comes
after the loop, such as closing questions or a thank-you message. That
also happens when a coder gets no units at all.

> Check the distribution in the preview before you deploy: a preview codes
> with your draft units, but stores nothing, and doesn't use up units of a
> shared queue.
