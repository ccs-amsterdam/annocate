---
title: Random conditions
section: Question types
order: 7
summary: A value drawn when the coder reaches it, without asking - for experiments that assign after a few questions, optionally with its own units.
---

A **random condition** is a kind of **computed variable**: **+** on an item
in a **Questions** block of the tree, then **Computed variable**, then
**Random condition**. It is never shown to coders.
Instead, AnnoTinder gives every coder a value when they reach it in the
flow: drawn at random, or balanced over the values (optionally within
groups). You then use that value like any other answer: to show different
questions or texts, or to give each condition its own units.

Random conditions are how you run experiments in AnnoTinder (see
[Experimental conditions](experimental-conditions.md)). Put one first to
assign the condition when the coder starts, or after some questions to
assign it later: after a pre-test or background questions, or to balance
groups on earlier answers.

## Where it goes

A random condition can only be placed **outside unit loops**: it is a
property of the coder, not of a unit. It is assigned where it is in the
design, when the coder gets there (see below). It has
no question text, because nobody sees it. Its **Item Name** is how you
refer to it, e.g. `group`.

## Drawn

Under **Drawn**, choose how the value is assigned:

| Drawn                                       | The coder gets                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Random**                                  | One of the options, at random. Give options a **weight** to make some more likely: weights 2 and 1 give about two thirds and one third |
| **Balanced (the value fewest coders have)** | The option that the fewest coders have so far, so groups stay as equal as possible. A tie is broken at random                          |

The **Options** list the values the question can take, each with a value
and an optional label, as for a [nominal question](nominal-and-ordinal.md).
Both need at least one option.

### Random or balanced?

**Random** is what most experiments assume: every coder has the
same chance of every condition, independently of everyone else. Group sizes
then vary by chance; with 40 coders a 25/15 split is quite possible.

**Balanced** keeps groups as equal as possible: each new coder gets the
option with the fewest coders so far. It counts everyone who reached the
question, including coders who stopped later. Use it when equal group sizes matter
more than strict independence, as when spreading a small team of coders
over parts of the units.

### URL parameter

A value from the web address the coder opened (such as `?wave=2`) is a
[URL parameter](session-parameters.md), declared under **URL parameters**
above the tree: `$session.wave`. It is stored when the session starts, like
the value of a random condition, and works in the same places: conditions,
texts, end items' return links. It isn't random, so don't use it for
experimental conditions.

## Balanced within groups

A balanced draw can be **stratified**: balanced within groups of coders
who gave the same answers to earlier questions, or have the same
[URL parameters](session-parameters.md). Choose them under **Balance within
groups of**. With `gender`, the conditions are balanced among women, and
among men, so both conditions get about as many women and as many men.
With `session.wave`, each wave is balanced on its own.

The questions must come before the random condition (outside unit loops), so
coders have answered them when they reach it. A coder who skipped one is in
the group of coders without an answer.

## Assigned when reached, never changed

A coder's value is assigned when they **reach** the random condition in the
design, not when they start. Put it where the assignment should happen:
after the screening questions, so coders who are screened out never
get a condition and don't count in the balance; after the questions it is
stratified on.

Once assigned, it never changes: not when they go back, reload the page,
come back the next day or continue on another device, and not when you
deploy a new design version. Coders can't see or change it.

This matters for experiments: a coder stays in their condition for
the whole session. It also means that changing the options or weights
later only affects coders who reach the question after the change.

## Using the value

A random condition is referred to like a nominal question with one answer:
`$var.group.value` is the value, `$var.group.label` its label.

**In conditions**, to ask questions only of one group:
`$var.group.is("experiment")`. See [Conditions](conditions.md).

**In a layout**, to show units differently per group:

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

Switch between _experiment_ and _control_ to see what each group sees.
See [Showing parts conditionally](template-blocks.md).

**For units**: under **Linked to units**, choose a set column of your
units. The loops after the random condition then give each coder only the
units whose cell holds their value (and the column's `_overlap` units).
With **All values in the column**, the values are the column's own: for
instance 100 sets for a multilevel design, drawn balanced over coders. See
[Experimental conditions](experimental-conditions.md).

In the results, the values of random conditions are in `coders.csv`, with the coders'
other answers outside unit loops. See [Downloading results](results.md).
