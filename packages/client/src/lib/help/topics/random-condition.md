---
title: Random conditions
section: Question types
order: 7
summary: A value drawn when the coder reaches it, without asking - for experiments that assign after a few questions, optionally with its own units.
---

A **random condition** is a kind of **computed variable**: **+** in the tree,
then **Computed variable**, then **Random condition**. It is never shown to
coders.
Instead, AnnoTinder gives every coder a value when they reach it in the
flow: drawn at random, or balanced over the values (optionally within
groups). You then use that value like any other answer: to show different
questions or texts, or to give each condition its own units.

Use it when the condition should be assigned *after* some questions: a
pre-test, background questions, or to balance groups on earlier answers.
A condition that should be set when the session starts (by the link, or
drawn at the start) is an **assigned condition** in **Session**: see
[Experimental conditions](experimental-conditions.md).

## Where it goes

A random condition can only be placed **outside unit loops**: it is a
property of the coder, not of a unit. It is assigned where it is in the
codebook, when the coder gets there (see below). It has
no question text, because nobody sees it. Its **Item Name** is how you
refer to it, e.g. `group`.

## Drawn

Under **Drawn**, choose how the value is assigned:

| Drawn | The coder gets |
| --- | --- |
| **Random** | One of the options, at random. Give options a **weight** to make some more likely: weights 2 and 1 give about two thirds and one third |
| **Balanced (the value fewest coders have)** | The option that the fewest coders have so far, so groups stay as equal as possible. Ties go to the first option in the list |

The **Options** list the values the question can take, each with a value
and an optional label, as for a [nominal question](nominal-and-ordinal.md).
Both need at least one option.

### Random or balanced?

**Random** is what most experiments assume: every participant has the
same chance of every condition, independently of everyone else. Group sizes
then vary by chance; with 40 participants a 25/15 split is quite possible.

**Balanced** keeps groups as equal as possible: each new coder gets the
option with the fewest coders so far. It counts everyone who reached the
question, including coders who stopped later. Use it when equal group sizes matter
more than strict independence, as when spreading a small team of coders
over parts of the units.

### URL parameter

A value from the web address the coder opened (such as a panel's
`PROLIFIC_PID`), or one fixed per link, is a
[session parameter](session-parameters.md), declared in the design's
session parameters: `$session.PROLIFIC_PID`, `$session.condition`. It is stored
when the session starts, like the value of a random condition, and works in the same
places: conditions, texts, end items' return links.

## Balanced within groups

A balanced draw can be **stratified**: balanced within groups of coders
who gave the same answers to earlier questions, or have the same
[session values](session-parameters.md). Choose them under **Balance within
groups of**. With `gender`, the conditions are balanced among women, and
among men, so both conditions get about as many women and as many men.
With `session.wave`, each wave is balanced on its own.

The questions must come before the random condition (outside unit loops), so
coders have answered them when they reach it. A coder who skipped one is in
the group of coders without an answer.

## Assigned when reached, never changed

A coder's value is assigned when they **reach** the random condition in the
codebook, not when they start. Put it where the assignment should happen:
after the screening questions, so participants who are screened out never
get a condition and don't count in the balance; after the questions it is
stratified on.

Once assigned, it never changes: not when they go back, reload the page,
come back the next day or continue on another device, and not when you
deploy a new design version. Coders can't see or change it.

This matters for experiments: a participant stays in their condition for
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

Switch between *experiment* and *control* to see what each group sees.
See [Showing parts conditionally](template-blocks.md).

**For units**: under **Linked to units**, choose a set column of your
units. The loops after the random condition then give each coder only the
units whose cell holds their value (and the column's `_overlap` units).
With **All values in the column**, the values are the column's own: for
instance 100 sets for a multilevel design, drawn balanced over coders. See
[Experimental conditions](experimental-conditions.md).

In the results, the values of random conditions are in `coders.csv`, with the coders'
other answers outside unit loops. See [Downloading results](results.md).
