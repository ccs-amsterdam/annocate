---
title: Categories: nominal and ordinal
section: Question types
order: 2
summary: Questions where coders pick from a list of options - with or without an order.
---

Most content analysis questions are about categories: *What is the main
topic?*, *Who is the main actor?*, *What is the tone?*. In AnnoTinder these
are **Nominal (categories)** and **Ordinal (ordered options)** questions.

- **Nominal**: the options have no order. Topics, actors, genres, yes/no.
  Coders can pick one option, or several if you allow it.
- **Ordinal**: the options are ordered, from low to high. Tone from
  negative to positive, how prominent an actor is, how much a coder agrees.
  Coders pick one.

## Options

Both types have a list of **Options**. Each option has three parts:

| Column | What it is |
| --- | --- |
| **Label (shown)** | What coders see on the button, e.g. *Human interest* |
| **Value (stored)** | What is saved and exported, e.g. `human_interest` |
| **Color** | Optional: a colour for the button, e.g. `#22c55e` or `green` |

Click **+ Add option** to add one. The arrows on each row move it up or down,
the cross removes it. The order in the list is the order coders see.

Values and labels are separate on purpose. The label is for coders: you can
reword it, fix a typo or translate it, and your data stays the same. The
value is for your analysis: it is what you find in the results and what
[conditions](conditions.md) compare. Change a value only when you really
mean a different category. See [Values and labels](design-values-and-labels.md).

### Nominal values follow the label

In a nominal question, a value is text. While you type a label, the value is
filled in for you: lower case, with `_` for spaces and punctuation, and
without accents. *Human interest* becomes `human_interest`, *Économie*
becomes `economie`.

Once you edit a value by hand, it stops following the label, so you can use
your own codes (for example `HI`, or the codes of an existing codebook).
Values can't be empty, can't have spaces at the start or end, and must
differ from each other.

> Nominal values are always text. If you want numbers that rise in order,
> you want an ordinal question.

### Ordinal values are 1, 2, 3, ...

In an ordinal question, values are numbers that rise in the order of the
options: 1 for the first option, 2 for the second, and so on. They are
renumbered when you add, remove or move options, so they always match the
order. The value column is greyed out to show this.

To use other numbers, tick **Custom values** and type them in, for example
`-2, -1, 0, 1, 2` for tone, or `0, 25, 50, 75, 100`. Custom values must
still rise in the order of the options; the editor warns if they don't.
Untick **Custom values** to go back to 1, 2, 3.

### Colours

A colour helps coders find an option quickly, for example red for
negative and green for positive. Use the colour names or codes you know
from the web (`red`, `#ef4444`). Keep colours meaningful: if every option
has a different bright colour, nothing stands out. Uncoloured options in
the compact layout get a shade that goes from light to dark along the
scale.

## Several answers

A nominal question can take several answers: tick **Allow several
answers**. Coders then click the options they want (a check mark shows
which), and click **Continue** to go on; the button counts their choices.
Without this, the first click is the answer and the next question comes up
right away.

Several answers are stored in the order of the options, not the order in
which the coder clicked them. In the results they are joined with `; `.
In references and conditions they are a list: `$var.topics.values`,
`$var.topics.labels`, and methods such as `$var.topics.has("economy")`
(see [Referring to answers and unit data](references.md)).

> Ordinal questions take one answer. If you want several ordered ratings,
> use a [scale](scale.md).

## How the options are laid out

Under **Layout** you choose how the options are shown. **Auto** chooses for
you, and says what it chose, such as *Auto (Grid, 2 columns)*.

| Layout | Nominal | Ordinal | Shows the options as |
| --- | --- | --- | --- |
| **Row (one row)** | yes | yes | buttons side by side |
| **Grid (columns)** | yes | yes | buttons in 1 to 4 **Columns** |
| **Flex (buttons wrap)** | yes | | buttons that fill a line and wrap to the next |
| **Compact (values; the selected one shows its label)** | | yes | one row of small buttons with the values; the end labels above |
| **Dropdown with filter** | yes | yes | a list that opens; coders can type to filter it |

For nominal questions, auto uses a row for up to three short options, then
a grid of two or one columns, and a dropdown for long lists. For ordinal
questions, it uses a row for up to three options, a single column for up
to six, and the compact layout for more. The layout is the same on every
device. See [How answers are laid out](answer-layouts.md) for the details
and when to choose your own.

## Number keys

Coders with a keyboard can press **1** to **9** to pick the first nine
options. The buttons show the number in a small badge (coders can hide
these with **Shortcuts** in their settings menu). In a question with
several answers, a number key ticks or unticks an option. The dropdown
layout has no number keys: coders type to filter instead.

## Switching between nominal and ordinal

You can switch a question between **Nominal (categories)** and **Ordinal
(ordered options)** under **Answer Type** without losing the options:

- **To ordinal**: the options keep their order and labels, and get the
  values 1, 2, 3, ... An option without a label gets its old value as its
  label, so coders see the same text.
- **To nominal**: each option gets a value made from its label (*Very
  negative* becomes `very_negative`).

**Allow several answers** is switched off, because ordinal questions take
one answer. The layout is kept if the new type has it, otherwise it goes
back to auto.

> Switching changes the values, so do it before coding starts. Answers
> already given keep the values they were given with.

## Using the answers

| Reference | Gives | For |
| --- | --- | --- |
| `$var.topic.value` | the value, e.g. `economy` or `3` | one answer |
| `$var.topic.label` | the label, e.g. *Economy* | one answer |
| `$var.topics.values` / `.labels` | a list | several answers |

Conditions can compare answers: a nominal answer with *is* or *is one of*,
an ordinal answer also with *greater than*, *lower than* and so on (for
example `$var.tone.gte(4)`). See [Conditions](conditions.md).

In the results, each question has a column with the values and, with
**Add label columns** (on by default), a `_label` column next to it. See
[Downloading results](results.md).
