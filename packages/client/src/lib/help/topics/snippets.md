---
title: Snippets
section: Unit layouts
order: 6
summary: Name a piece of a loop's template and use it anywhere with [[name]] - for long instructions, banners and repeated conditions.
---

A **snippet** is a named piece of template text. You write it once, below
the loop's template, and use it with `[[name]]`. Before anything else is
read, AnnoTinder pastes the snippet's text in its place, as if you had typed
it there.

Snippets keep a layout readable: a long instruction text, a banner for each
experimental group or a condition you need in several places gets a name,
and the template shows what goes where.

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

Open **Snippets** below the template to see the snippet's text.

## Making a snippet

On the loop's **Layout** tab, below the template and the colours:

1. Click **+ Snippet**. A snippet called `snippet_1` is added.
2. Give it a name between the `[[` and `]]`: letters, digits and `_`, such as
   `instructions` or `experiment_banner`.
3. Write its text in the box below the name: markdown, values, blocks,
   anything a template can hold.

To use it, write `[[instructions]]` in the template. **Insert** › **Snippet**
lists the loop's snippets, and typing `[[` in the template editor suggests
their names. The trash button removes a snippet.

> Renaming a snippet doesn't change the places that use it. The editor then
> reports *[[old_name]]: there is no snippet 'old_name' in this loop's
> layout*, so you can find them.

## Where snippets work

A snippet can stand anywhere in the loop's template, because it is pasted in
as text before the template is read:

- on a line of its own, for a paragraph or a whole block;
- inside a sentence: `Read [[what_to_read]] carefully.`;
- in a block's fence line: `::: if [[is_viral]]`;
- inside a script: `{{ [[reactions]] * 2 }}`.

Snippets also work in the texts of the loop's questions and instructions, so
a long instruction can be shared by several questions.

They don't work outside a loop (*Snippets ([[name]]) can only be used in a
unit loop's layout and its questions' texts*), and not in condition items.
In code (between backticks) `[[name]]` stays as it is.

## A snippet is text, not a value

Because a snippet is pasted in as text, everything in it works as if it were
written in the template: markdown, values (`$unit.headline`), scripts,
blocks, and other snippets. And for the same reason it takes no suffix:
`[[intro]]::markdown` is an error (*a snippet takes no suffix*). To show a
snippet's text as markdown, it already is: the template is markdown.

A snippet may use other snippets, but not itself, also not through another
one (*the snippet includes itself (a → b → a)*).

## Banners per group

In a survey experiment, each group sees its own version of a message. With
a snippet per version, the template stays short:

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

A snippet can hold part of a script or a condition. Here `reactions` is the
number of likes and shares, used in a condition and in a value:

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

Note the brackets around the snippet's text. A snippet is pasted in as it
is, so without them `[[reactions]] * 2` would become
`$unit.likes + $unit.shares * 2`, which is something else.

## Tips

- Give snippets names that say what they are for (`beginner_tip`,
  `is_political`), not what they look like.
- A snippet belongs to its loop. Another loop needs its own copy.
- Snippets make a template shorter, but the reader has to look them up.
  For a piece used once, a snippet only helps if it is long.
- Snippets are part of the codebook: when you share a codebook, its
  snippets come with it.
