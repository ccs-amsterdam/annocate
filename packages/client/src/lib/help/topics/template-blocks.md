---
title: Showing parts conditionally
section: Unit layouts
order: 3
summary: Show part of a layout only to some coders or for some units, or from a question of the loop on.
---

A layout doesn't have to look the same for every coder and every unit. With
**blocks** you can show a part of it only when a condition holds (a warning
label for the experiment group, a tip for beginners, a badge for viral
posts), or only from a question of the loop on (the full article after a
first impression of the headline).

A block is a few lines of the template between two **fence lines** that
start with `:::`. The first fence says what kind of block it is, a bare
`:::` closes it:

```template
::: if $var.group.is('experiment')
> **Note:** fact-checkers flagged this article as possibly misleading.
:::
```

The fence lines themselves are never shown.

## Show if a condition holds

`::: if <condition>` shows its lines only if the condition holds. The
condition is the same kind of condition as in a
[condition item](conditions.md): `$var.group.is('experiment')` holds if the
coder's answer to `group` is `experiment`.

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
answers:
  group: experiment | control
---
::: if $var.group.is('experiment')
> **Note:** fact-checkers flagged this article as possibly misleading.
:::

# $unit.headline

$unit.text
```

Switch the answer to `group` above the result to see what each group sees.
This is how a survey experiment shows two versions of the same stimulus: an
[assigned variable](auto.md) puts coders (or participants) in a group at
random, and the layout shows each group its version.

### Else if and else

After an `::: if`, `::: else if <condition>` gives a second condition, and
`::: else` the lines to show when none holds. Only the first part whose
condition holds is shown. One `:::` closes them all.

```example
unit:
  headline: Storm hits the coast
answers:
  experience: beginner | expert | -
---
::: if $var.experience.is('beginner')
**Tip:** read the whole article before you answer. You can always go back.
::: else if $var.experience.is('expert')
Code as you normally would.
::: else
*Please tell us about your experience first.*
:::

# $unit.headline
```

The `-` answer is "not answered": then `.is(...)` doesn't hold, so the
`else` part shows.

### What a condition can use

A condition in a layout can use:

- the unit's data: `::: if $unit.likes > 1000`;
- the answers to coder-level questions before the loop:
  `::: if $var.group.is('experiment')`;
- inside a `::: from` block (below), the answers to the loop's questions
  before that block's question.

```example
unit:
  text: Can't believe the storm flooded the whole town #storm
  likes: 2400
---
::: if $unit.likes > 1000
**Viral post** · $unit.likes likes
:::

$unit.text
```

Conditions can be written as rules, or as a short script for anything else.
The helpers (`is`, `isAny`, `gt`, `between`, ...) are listed in
[Helper methods](conditions.md#helper-methods), and what you can refer to in
[Referring to answers and unit data](references.md). A condition that can't
be evaluated (for instance a script with an error) counts as not holding.

### Editing a condition as rules

You don't need to write conditions by hand. In the template editor:

- **Insert** › **Show if…** opens the rules editor. Choose the question, how
  to compare and the value, and click **Insert**: the block is written for
  you, around the text you had selected.
- Above every `::: if` and `::: else if` line, the editor shows the
  condition in words, followed by **edit**. Click it to change the condition
  in the rules editor and **Apply** it.

### Inside a sentence

Fence lines are left out, and the lines around them join up as if the fence
lines weren't there. So a block can also change a few words in a paragraph:

```example
unit:
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
answers:
  source: shown | hidden
---
Please read the following article
::: if $var.source.is('shown')
from **The Daily Planet**
:::
carefully.

$unit.text
```

## Show from a question on

`::: from <question>` shows its lines from the moment that question of the
loop is on screen, and for the rest of the unit. Before it, the lines are not
there. This lets the unit change as the coder works through its questions:

- show the headline first and the full article from the second question on;
- reveal the source of a message only after a first credibility rating;
- remind coders of an earlier answer.

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday. Residents were evacuated as water levels kept rising.
steps: first_impression, credibility
---
# $unit.headline

::: from credibility
$unit.text
:::
```

Use **Question on screen** above the result to step through the loop's
questions. A few things to know:

- "From" follows the order of the questions in the loop. When a coder goes
  back to an earlier question, the block is hidden again.
- A question that is skipped (its condition doesn't hold) still counts as
  reached once the coder is past it.
- `::: from` only works in a loop's layout, and only with questions of that
  loop (*"'x' is not a question of this loop"*).
- **Insert** › **Show from…** lists the loop's questions and writes the block
  for you.

### Stages

Several `::: from` fences in a row form one block of **stages**: the last
stage whose question is reached is shown, and only that one. One `:::` closes
them all.

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
  source: Daily Planet
steps: headline_only, with_text, with_source
---
# $unit.headline

::: from with_text
$unit.text
::: from with_source
$unit.text

*Published by $unit.source*
:::
```

Because only one stage shows, the text is repeated in the last stage.
Anything that should show in every stage goes outside the block.

### Earlier answers in a stage

Outside a `::: from` block, the layout can't use the answers to the loop's
own questions: the layout is shown before any of them is answered.
AnnoTinder reports this as *"'sentiment' is asked after this point"*. Inside
a `::: from` block, the questions *before* its question can be used, in
values and in conditions:

```example
unit:
  headline: Storm hits the coast
answers:
  sentiment: positive | neutral | negative | -
steps: sentiment, topics
---
# $unit.headline

:::: from topics
::: if $var.sentiment.answered
You rated the tone of this article as **$var.sentiment.label**.
:::
::::
```

The block's own question can't be used in it (`topics` here): it is being
answered while the block is shown.

## Blocks inside blocks

Blocks can be put inside each other: an `::: if` inside a `::: from`, a
`::: style` inside an `::: if`, and so on. A bare `:::` closes the block
that was opened last.

A closing fence must have **as many colons** as the fence that opened its
block. Give outer blocks more colons, as in the example above
(`:::: from` ... `::::` around `::: if` ... `:::`). That makes the template
easier to read, and when a closing fence is missing, AnnoTinder can tell
which one:

```template
:::: if $var.group.is('experiment')
::: if $unit.likes > 1000
**Viral post**
:::
> **Note:** fact-checkers flagged this post.
::::
```

An `::: else` (or `::: else if`) continues the `::: if` block that is open,
and needs the same number of colons; close any blocks inside it first. A
`::: from` right after another `::: from` with the same colons is a next
stage, not a block inside it: to put a `::: from` block inside a stage, give
the outer one more colons.

## When something is wrong

The template editor lists problems below the template. The most common:

| Message | What to do |
| --- | --- |
| *::: if is not closed (end it with :::)* | Add a closing fence with the same number of colons |
| *This ::: closes a block opened with 4 colons: use ::::* | Match the colons of the closing fence to its opening fence |
| *::: closes nothing: no block is open* | Remove the extra `:::`, or add the block's opening fence |
| *::: else must follow a ::: if (with as many colons)* | Put the `::: else` inside an `::: if` block, with the same colons |
| *Unknown block "when"* | Use one of `if`, `else if`, `else`, `from`, `style`, `text`, `markdown`, `html`, `image` |
| *::: if needs a condition* | Write the condition after `::: if` |

## In question texts

`::: if`, `::: else if` and `::: else` also work in the texts of questions
and instructions, for instance to word a question differently for the
experiment group. `::: from` doesn't: a question is always on screen when
its own text is.

## Other blocks

The same fence lines make other blocks, each with its own page:

- `::: style` for font sizes, colours and boxes: see
  [Colours and styles](colours-and-styles.md).
- `::: markdown`, `::: text`, `::: html` and `::: image` to show a larger
  piece as one thing: see [Typed blocks and names](typed-blocks.md).
- A condition or a whole block can be a [snippet](snippets.md), to reuse it.
