---
title: Handing out units
section: Units and distribution
order: 3
summary: Which units a session codes - the session's units, a loop's filter, crowd coding, and the order of units.
---

Two things decide which units a coder gets:

1. **The session's units**, decided once per session, for the whole
   study: all units, or, when the design divides them, the units of the
   session's coder and its linked conditions.
2. **Each unit loop** works within those: all of them by default, or a
   part (a filter), and either every unit once or as a shared queue
   (crowd coding).

A loop doesn't decide *who* gets which units: that is in the design's
**Session** and in your [set columns](sets.md).

## The session's units

| The design says | A session gets |
| --- | --- |
| nothing | all units |
| **Units are divided over coders** (column `coder`) | the units of its coder (see [Giving each coder their own units](own-units.md)) |
| a condition **linked to units** (column `framing`) | the units of its condition (see [Experimental conditions](experimental-conditions.md)) |
| both | the units that match both |

Units in a column's `_overlap` are for everyone. The loop's **Units** tab
says in one line what a session gets, for example *"A session gets the
units of its coder × framing."*

## A loop's units

On the loop's **Units** tab:

- **All the session's units** (the default): every coder codes all of
  them, once.
- **Only those with a value of a set column**, or **Except those with a
  value of a set column**: pick the column and the values. Two loops can
  then split the units, for instance a `phase` column with `pre` and `post`:
  the first loop codes `pre`, then come some questions, then a second loop
  codes `post`. Or: first a loop with only the `_overlap` units, then one
  with the rest.

## Crowd coding

Tick **Share the units among coders** to make the loop a shared queue:
coders who get the same units draw from one queue, and a unit is handed
out until enough coders coded it (or agree on a question), then to no one
else. Use it when coders come and go and each unit needs, say, two codings.
The settings (coders per unit, agreement, units per coder) are explained in
[Shared queues](shared-queues.md).

## Overlap, practice and gold units

A loop places the special units of the session's set columns among the
coder's own units: overlap units, practice units first, gold units spread
through them. See [Overlap](overlap.md) and
[Overlap, gold and practice units](special-units.md).

## Order

Under **Order** you choose in which order a coder gets their units:

| Order | What coders get |
| --- | --- |
| **In set order** | The units in the order of their set (or the order they were uploaded). Every coder gets the same order. |
| **Random (each coder their own order)** | Every coder gets the units in their own random order. |

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

## Different settings for different coders

A loop can use other settings for some coders, for instance another filter
for coders who answered a question differently: see
[Coder groups](coder-groups.md).

## What coders see when they run out

A coder who has no units left in a loop continues with whatever comes
after the loop, such as closing questions or a thank-you message. That
also happens when a session gets no units at all.

> Check the distribution in the preview before you deploy: a preview codes
> with your draft units, but stores nothing, and doesn't use up units of a
> shared queue.
