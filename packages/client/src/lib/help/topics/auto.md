---
title: Assigned variables
section: Question types
order: 7
summary: Auto variables give each coder a value without asking - for experimental groups and routing.
---

An **Auto (assigned, not asked)** question is never shown to coders.
Instead, AnnoTinder gives every coder a value when they reach it: drawn
at random, or balanced over the options (optionally within groups). You then use that value like any other
answer: to show different material to different groups, or to give
different coders different units.

Typical uses:

- **Experimental conditions** in a survey experiment: half of the
  participants see the article with a source cue, the other half without.
- **Splitting the work**: coders are spread evenly over parts of your
  units.

Values that come *from the link* (a panel's participant id, a condition per
link, a group you know in advance) are not assigned variables but
[session parameters](session-parameters.md): `$session.<name>`.

## Where it goes

An auto question can only be placed **outside unit loops**: it is a
property of the coder, not of a unit. It is assigned where it is in the
codebook, when the coder gets there (see below). It has
no question text, because nobody sees it. Its **Item Name** is how you
refer to it, e.g. `group`.

## Sources

Under **Source**, choose how the value is assigned:

| Source | The coder gets |
| --- | --- |
| **Random draw** | One of the options, at random. Give options a **weight** to make some more likely: weights 2 and 1 give about two thirds and one third |
| **Balanced (option with fewest coders)** | The option that the fewest coders have so far, so groups stay as equal as possible. Ties go to the first option in the list |

The **Options** list the values the variable can take, each with a value
and an optional label, as for a [nominal question](nominal-and-ordinal.md).
Both need at least one option.

### Random or balanced?

**Random draw** is what most experiments assume: every participant has the
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
[session parameter](session-parameters.md), declared in the codebook's
Session item: `$session.PROLIFIC_PID`, `$session.condition`. It is stored
when the session starts, like an assigned variable, and works in the same
places: conditions, texts, end items' return links.

## Balanced within groups

A balanced draw can be **stratified**: balanced within groups of coders
who gave the same answers to earlier questions, or have the same
[session values](session-parameters.md). Choose them under **Balance within
groups of**. With `gender`, the conditions are balanced among women, and
among men, so both conditions get about as many women and as many men.
With `session.wave`, each wave is balanced on its own.

The questions must come before the auto question (outside unit loops), so
coders have answered them when they reach it. A coder who skipped one is in
the group of coders without an answer.

## Assigned when reached, never changed

A coder's value is assigned when they **reach** the auto question in the
codebook, not when they start. Put it where the assignment should happen:
after the screening questions, so participants who are screened out never
get a condition and don't count in the balance; after the questions it is
stratified on.

Once assigned, it never changes: not when they go back, reload the page,
come back the next day or continue on another device, and not when you
publish a new version of the codebook. Coders can't see or change it.

This matters for experiments: a participant stays in their condition for
the whole session. It also means that changing the options or weights
later only affects coders who reach the question after the change.

## Using the value

An auto question is referred to like a nominal question with one answer:
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

**For units**, to give each group its own units: a loop can have a coder
group per value, each with its own set (`$var.group.is("experiment")` gets
the set `experiment`). See [Different units for different coders](coder-groups.md).

In the results, auto variables are in `coders.csv`, with the coders'
other answers outside unit loops. See [Downloading results](results.md).
