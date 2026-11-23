---
title: Snippets
section: Unit layouts
order: 6
summary: Name a piece of a layout's template and use it anywhere with [[name]] - for long instructions, banners and repeated conditions.
---

A **snippet** is a named piece of template text. Write it once below a
layout's template and use it with `[[name]]`: it is pasted in as if you had
typed it there. Good for long instructions, a banner per group, or a
condition used in several places.

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
snippets:
  instructions: |
    ::: style border: 1px solid var(--border); border-radius: 8px; padding: 0.75em 1em
    **Instructions:** read the article and answer the questions below. If an
    article is not about a storm, answer *not applicable*.
    :::
---
[[instructions]]

# $unit.headline

$unit.text
```

## Making a snippet

Select the loop's **Layout** item; below the template (in
**Advanced**):

1. Click **+ Snippet**.
2. Name it between `[[` and `]]` (letters, digits, `_`), e.g.
   `instructions`.
3. Write its text: anything a template can hold.

Use it with `[[instructions]]`; **Insert** › **Snippet** and typing `[[`
suggest names. Renaming a snippet doesn't update where it is used; the
editor reports those places.

## Where snippets work

Anywhere in the layout's template (a line, inside a sentence, a fence
line `::: if [[is_viral]]`, a script `{{ [[reactions]] * 2 }}`). Question
and instruction texts and end messages in the loop can use the snippets of
all the loop's layouts. Not outside loops or in conditions.

A snippet is text, not a value: it takes no suffix, may use other snippets
but not itself.

## Banners per group

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
answers:
  group: experiment | control
snippets:
  experiment_banner: |
    > **Fact-check:** independent fact-checkers rated this article as
    > *partly false*.
  control_banner: |
    > Read the article below.
---
::: if $var.group.is('experiment')
[[experiment_banner]]
::: else
[[control_banner]]
:::

# $unit.headline

$unit.text
```

## A condition used twice

```example
unit:
  text: Can't believe the storm flooded the whole town #storm
  likes: 2400
  shares: 310
snippets:
  reactions: ($unit.likes + $unit.shares)
---
::: if [[reactions]] > 1000
**Viral post**
:::

$unit.text

*{{ [[reactions]] }} likes and shares*
```

Mind the brackets: without them `[[reactions]] * 2` would become
`$unit.likes + $unit.shares * 2`.

Snippets belong to their loop (another loop needs its own copy) and come
along when you share the design.
