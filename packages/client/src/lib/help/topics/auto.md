---
title: Assigned variables
section: Question types
order: 7
summary: Auto variables give each coder a value without asking - for experimental groups and routing.
---

An **Auto (assigned, not asked)** question is never shown to coders.
Instead, AnnoTinder gives every coder a value when they start: drawn at
random, balanced over the options, set by their invitation link, or taken
from the web address they opened. You then use that value like any other
answer: to show different material to different groups, or to give
different coders different units.

Typical uses:

- **Experimental conditions** in a survey experiment: half of the
  participants see the article with a source cue, the other half without.
- **Splitting the work**: coders are spread evenly over parts of your
  units.
- **Panel ids**: the participant id from Prolific or another panel, taken
  from the link, to send people back with the right code at the end.
- **Groups you know in advance**: experts get a different set of units
  than students, set per invitation.

## Where it goes

An auto question can only be placed **outside unit loops**, normally at the
top of the codebook: it is a property of the coder, not of a unit. It has
no question text, because nobody sees it. Its **Item Name** is how you
refer to it, e.g. `group`.

## Sources

Under **Source**, choose how the value is assigned:

| Source | The coder gets |
| --- | --- |
| **Random draw** | One of the options, at random. Give options a **weight** to make some more likely: weights 2 and 1 give about two thirds and one third |
| **Balanced (option with fewest coders)** | The option that the fewest coders have so far, so groups stay as equal as possible. Ties go to the first option in the list |
| **Set by invitation** | The value preset on the invitation link the coder used |
| **URL parameter** | The value of a parameter in the web address the coder opened |

The **Options** list the values the variable can take, each with a value
and an optional label, as for a [nominal question](nominal-and-ordinal.md).
Random, balanced and invitation need at least one option.

### Random or balanced?

**Random draw** is what most experiments assume: every participant has the
same chance of every condition, independently of everyone else. Group sizes
then vary by chance; with 40 participants a 25/15 split is quite possible.

**Balanced** keeps groups as equal as possible: each new coder gets the
option with the fewest coders so far. It counts everyone who started,
including coders who stopped halfway. Use it when equal group sizes matter
more than strict independence, as when spreading a small team of coders
over parts of the units.

### Set by invitation

When you create an invitation, you can preset variables for everyone who
uses that link, in the **Preset variables** box: `group=experts`, or several
separated by commas, `group=experts, slot=2`. Use the option values of the
auto question. See [Invitations](invitations.md).

**If the invitation doesn't set it** decides what happens with a link
without a preset: **Leave empty** (no value), **Random draw** or
**Balanced**. A common set-up is one link per known group, plus a general
link where the value falls back to balanced.

### URL parameter

Online panels add the participant's id to the link they send people to,
such as `...?PROLIFIC_PID=5f3a...`. Fill in the name of that parameter under
**URL parameter name** (here `PROLIFIC_PID`) and the auto question stores
its value. Use it in the redirect URL of an [end item](end-items.md) to send
participants back with their id, or to link your data to the panel's. See
[Online panels and crowd coding](online-panels.md).

A URL parameter can carry any value, so the editor shows no options for it.
To accept only some values (say `a` and `b` for a condition set by the
panel), add `options` to the question in the JSON view: other values are
then ignored.

The value is read when the coder first opens the link and stored, so later
visits don't need the parameter. If it was missing the first time, a later
visit with the parameter fills it in.

## Assigned once, never changed

A coder's value is assigned when they start, before the first question,
and it never changes afterwards: not when they reload the page, come back
the next day or continue on another device, and not when you publish a new
version of the codebook. Coders can't see or change it.

This matters for experiments: a participant stays in their condition for
the whole session. It also means that changing the options or weights
later only affects coders who start after the change.

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

**For units**, to give each group its own units: a loop can choose units
by a condition on the auto variable, or use it in the name of a unitset,
such as `part_$var.slot.value`. See
[Different units for different coders](coder-groups.md).

In the results, auto variables are in `coders.csv`, with the coders'
other answers outside unit loops. See [Downloading results](results.md).
