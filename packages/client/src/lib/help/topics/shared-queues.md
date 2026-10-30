---
title: Shared queues: coding until enough coders agree
section: Units and distribution
order: 4
summary: Crowd coding (units shared among coders) - how many codings a unit needs, agreement rules, limits per coder, priority and what it means for analysis.
---

With **Crowd coding**, all coders draw from one queue of units.
Each unit is handed out until it is **done**, and then to no one else. You
decide when a unit is done: when a number of coders coded it, or when a
number of coders gave the same answer.

This is the mode for large samples and for crowd coding: you don't need to
know in advance how many coders will come, or how many units each will do.
Coders who do more simply code more units, and the queue makes sure the
codings are spread over the units.

You set it on the loop's **Units** tab: choose **Units shared among
coders** under **Who codes which units**, and pick the **Unitset** (empty for
all units).

## The settings

The numbers sit in a small table, each with an **at least** and an **at
most**:

| | at least | at most |
| --- | --- | --- |
| **Units per coder** | every coder gets this many units (see [A minimum per coder](#a-minimum-per-coder)) | a coder never gets more |
| **Coders per unit** | a unit is done once this many coders coded it | when no unit needs more coders, a unit can still go up to this many |
| *or* **Agreement per unit** | a unit is done once this many coders agree on the question you pick | a unit is never coded by more coders, agreement or not |

## When a unit is done

In the second row you choose one of two rules:

- **Coders per unit**: the unit is done once *at least* coders finished it.
  `1` gives every unit one coding, the cheapest way through a large sample;
  `2` or `3` give you several codings per unit, for majority votes or
  reliability.
- **Agreement per unit**, on a question: the unit is done once *at least*
  coders gave the same answer to that question. Only questions of the loop with a
  single categorical answer can be chosen: categories (nominal, without
  multiple answers), ordinal questions and swipes. Coders who skipped the
  question (it was hidden by a condition) don't count towards agreement.

An agreement rule spends codings where they are needed. *"Until 2 coders
agree on `sentiment`, at most 5"* gives clear-cut units 2 codings, and
difficult units up to 5, until two coders agree or the maximum is reached.

A coder counts once they **finished** the unit: answered all its questions.
A coder who opens a unit and leaves doesn't count.

## Limits

The **at most** of the second row is the most coders a unit ever gets. With
an agreement rule it is required, so a unit nobody agrees on isn't coded
forever. With **Coders per unit** it may stay empty: then it is the same as
*at least*. It can't be below *at least*.

**At most units per coder** (overlap units come on top) is worth setting in
most studies:

- it limits fatigue, and keeps one enthusiastic coder from coding half the
  sample;
- with a panel (Prolific and the like), it fixes the size of each task, so
  you can pay everyone the same and estimate the time;
- coders see their progress (*unit 12 of 40*). Without a maximum, AnnoTinder
  doesn't know how many units a coder will get, and can only count the units
  they have done so far;
- spreading [overlap](overlap.md) units through a coder's units needs it.

A rough sample size: with 1000 units, *until 3 coders coded it* and **Max
units per coder** 50, you need at least 1000 × 3 / 50 = 60 coders who finish.
Recruit a few more, because some will stop early.

### Near the end of the queue

When no unit needs more coders (every unit is done, or reserved by coders
working on it), a coder who asks for a unit still gets one, as long as some
unit isn't **full**: coded by *at most* coders (finished codings count, not
reservations), or agreed on. Among those, the coder gets the units with the
fewest codings and reservations, so extra codings are spread. A coder only
gets nothing once every unit is full.

### A minimum per coder

Even so, a coder who arrives late can get few units or none, once units
are full. That is a problem when every coder must do a fixed task, for
instance a panel that pays for 20 units, or a design where every coder must
code enough units to estimate their own reliability.

**At least units per coder** solves this. While a coder has fewer units,
*at most coders per unit* gives way too: the coder may get a unit that
already has the most coders. With an agreement rule, a unit coders agree on
is never handed out again; with **Coders per unit**, any unit can be. The
coder gets the units with the fewest codings first, so extra codings are
spread over the units. With an agreement rule, a coder can still end up
with fewer than the minimum if coders agree on every unit.

The price is codings past *at most*. Set the minimum only as high as your
design needs.

## Priority

**Priority** decides which units come first:

- **Cover all units first** (the default): the least-coded units come first.
  Every unit gets its first coding before any unit gets a second. If you stop
  the study early, you have codings spread over the whole sample.
- **Finish units first**: the units closest to done come first. Units are
  completed one after the other, so you get complete units (with all the
  codings they need) early on. If you stop early, part of the sample is
  complete and the rest has nothing.

Within the same priority, coders get units in the loop's order: see
[Order](unit-distribution.md#order). In a shared queue, **Random** order
spreads coders over the queue.

## Units being coded right now

When a unit is handed to a coder, it is **reserved** for them for 15
minutes. During that time, it isn't handed to more coders than it still
needs. This keeps the queue from giving the last needed coding of a unit to
five coders at once.

- A coder's browser loads a few units ahead (up to five), and each is
  reserved for them.
- A coder who reloads the page, or comes back within those minutes, gets the
  same units again.
- A coder who leaves halfway frees the units they held after 15 minutes,
  and they go back into the queue.
- A coder who comes back later can still finish the unit they had. So a unit
  occasionally gets one coding more than it needed.

When all units that still need codings are reserved by others, a coder
gets one of them anyway, or a unit that isn't full yet (see [Near the end
of the queue](#near-the-end-of-the-queue)), rather than nothing.

The 15 minutes can be changed in the codebook's JSON view, as
`leaseSeconds` in the loop's `units` (one entry per coder group; default `900`), for instance
for units that take long to code.

## What this means for analysis

Shared queues are efficient, but the data look different from a design in
which every coder codes every unit:

- **Units have different coders.** Each unit is coded by whichever coders
  came along. For reliability, use a measure that allows for this, such as
  Krippendorff's alpha, which handles any number of coders per unit and
  missing codings.
- **Units have different numbers of codings** with an agreement rule:
  between the number that must agree and *at most* coders per unit. A unit with
  more codings was harder to agree on; that is information in itself.
- **Agreement rules make the data look more reliable than they are.** Coding
  stops as soon as coders agree, so disagreements that a third coder would
  have shown are never seen. Don't compute reliability on units coded under
  an agreement rule. Add an [overlap](overlap.md) set that every coder codes
  in full, and compute reliability on that.
- **Majority labels.** With several codings per unit, the usual final label
  is the most frequent answer. With *until 2 agree*, that is the answer the
  agreeing coders gave.
- **Coders differ in how much they coded.** A few coders may do many units.
  Check per coder (the `coder_id` column of the [results](results.md)) that
  no coder is systematically off, and consider coder effects in your
  analysis.

> Check progress on the **Overview** tab: under **Progress**, each loop and
> unitset shows how many units are complete, and how many coders work on it.
