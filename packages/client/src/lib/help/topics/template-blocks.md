---
title: Showing parts conditionally
section: Unit layouts
order: 3
summary: Show part of a layout only to some coders or for some units, or from a question of the loop on.
---

With **blocks** a part of the layout shows only when a condition holds (a
warning for the experiment group, a badge for viral posts), or only from a
question of the loop on (the full article after a first impression). A
block sits between **fence lines** starting with `:::`; a bare `:::`
closes it. Fence lines are never shown.

You don't have to type them: **Insert** › **Show if…** or **Show from…**
above the template writes the block around the selected text.

## Show if a condition holds

`::: if <condition>` shows its lines only when the condition holds (the
same conditions as a [Show if item](conditions.md)):

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

Switch `group` above the result to see each group's version: with a
[random condition](random-condition.md), this is a survey experiment.

### Else if and else

Only the first part that holds is shown; one `:::` closes them all.

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

### What a condition can use

- the unit's data: `::: if $unit.likes > 1000`;
- answers to questions before the loop;
- inside a `::: from` block, the loop's questions before that block's
  question.

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

See [Helper methods](conditions.md#helper-methods). A condition that
fails counts as not holding. Above each `::: if` line the editor shows the
condition in words with **edit**, to change it in the rules editor.

### Inside a sentence

Lines around a block join up, so a block can change a few words:

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

`::: from <question>` shows its lines once that loop question is on
screen, for the rest of the unit: the headline first and the article
later, the source after a first rating.

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

Use **Question on screen** above the result to step through. Going back
hides the block again; a skipped question counts as reached once passed.
Only in a loop's layout, with that loop's questions.

### Stages

Several `::: from` fences in a row are **stages**: only the last reached
one shows.

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

### Earlier answers in a stage

Outside `::: from`, the layout can't use the loop's own answers (it is
shown before they are given). Inside, it can use the questions before the
block's question:

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

## Blocks inside blocks

A closing fence needs **as many colons** as its opening fence. Give outer
blocks more colons:

```template
:::: if $var.group.is('experiment')
::: if $unit.likes > 1000
**Viral post**
:::
> **Note:** fact-checkers flagged this post.
::::
```

`::: else` needs the colons of its `::: if`. A `::: from` right after
another with the same colons is a next stage; to nest one, give the outer
more colons.

## When something is wrong

| Message                                                  | Fix                                                |
| -------------------------------------------------------- | -------------------------------------------------- |
| _::: if is not closed (end it with :::)_                 | add a closing fence with the same colons           |
| _This ::: closes a block opened with 4 colons: use ::::_ | match the colons                                   |
| _::: closes nothing: no block is open_                   | remove it, or add the opening fence                |
| _::: else must follow a ::: if (with as many colons)_    | put it in an `::: if` block                        |
| _Unknown block "when"_                                   | use `if`, `else if`, `else`, `from`, `style`, `text`, `markdown`, `html`, `image` |
| _::: if needs a condition_                               | write the condition                                |

## In question texts

`::: if`, `::: else if` and `::: else` also work in question and
instruction texts; `::: from` doesn't.

Other blocks: `::: style` ([Colours and styles](colours-and-styles.md)),
`::: markdown`, `::: text`, `::: html`, `::: image`
([Typed blocks and names](typed-blocks.md)), and [snippets](snippets.md).
