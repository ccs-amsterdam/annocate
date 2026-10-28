---
title: Typed blocks and names
section: Unit layouts
order: 5
summary: Show a larger piece of a layout as markdown, plain text, HTML or an image, and name it so questions can point at it.
---

A [suffix](layout-templates.md#suffixes-showing-a-value-as-something-else)
says how to show one value: `$unit.body::markdown` shows the field `body` as
markdown. A **typed block** does the same for a larger piece of the template,
with text and several values in it. Everything between the fences is put
together first, and the result is shown as one thing of that type.

```template
::: markdown
**$unit.speaker** said: $unit.quote
:::
```

A typed block can also have a **name**, so that a question can point at it,
or a span question can select text in it. The second half of this page is
about names.

## The four types

| Block | Shows its content as |
| --- | --- |
| `::: text` | Plain text, exactly as it is |
| `::: markdown` | Markdown: values that contain markdown are read as markdown too |
| `::: html` | HTML, in a safe frame (see [HTML in a layout](html.md)) |
| `::: image` | An image: the content is the image's address (URL) |

A suffix is the short form of a block around one value: `$unit.body::markdown`
is the same as

```template
::: markdown
$unit.body
:::
```

### Values are put in as they are

The difference with the template around it: inside a typed block, values are
put into the content as they are, and the content as a whole is shown as its
type. In the template, `$unit.lead` shows the stars in the data as stars;
inside a `::: markdown` block they make bold text:

```example
unit:
  lead: The storm hit **three towns** on Tuesday.
  towns: |
    - Smallville
    - Riverdale
    - Hill Valley
---
$unit.lead

::: markdown
$unit.lead Most damage was in:

$unit.towns
:::
```

Use a markdown block when your data contains markdown and you want to put
text of your own around it, or combine several fields into one text. Keep in
mind that *all* markdown in the values is then read: a `*` or `_` in a tweet
can turn text italic. For plain texts, values outside a block are safer.

### Text blocks

A `::: text` block shows its content as plain text: no markdown, line breaks
kept. That is rarely needed, since values are plain text already; it is
useful for text put together from several values and scripts, shown
literally, and with a name a question can [focus on](#focus-on) it.

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
---
::: text article
$unit.headline

$unit.text
:::
```

This shows the headline and the text as one plain text called `article`.

### Image blocks

A `::: image` block shows an image; its content is the address. That way the
address can be put together from parts, for instance when your units only
have a file name:

```example
unit:
  file: a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg
---
::: image
https://upload.wikimedia.org/wikipedia/commons/thumb/$unit.file
:::
```

### HTML blocks

A `::: html` block shows its content as HTML, in a sandbox: your own HTML
with values from the unit in it, for example a mock social media post. See
[HTML in a layout](html.md).

### Rules

- **No suffixes inside.** Values in a typed block are put in as they are, so
  `$unit.body::markdown` inside a `::: markdown` block is an error: *Inside a
  ::: markdown block values are put in as they are: leave out ::markdown*.
- **No typed blocks inside typed blocks.** *A ::: html block can't be inside
  a ::: markdown block.* Typed blocks can be inside `::: if`, `::: from` and
  `::: style` blocks, and `::: if` and `::: from` blocks can be inside them.
- **`::: style` only inside markdown.** Inside a `::: text`, `::: html` or
  `::: image` block, style the content in its own way (in HTML: with
  `style="..."`).
- **Close it.** A typed block is closed with `:::`, like other blocks.

The fences of a typed block always go on lines of their own: the block is
shown as a part of its own, not inside a sentence.

## Ids

AnnoTinder gives the parts of a layout **ids**, so questions can refer to
them:

| What the layout shows | Its id |
| --- | --- |
| A unit field: `$unit.headline` (also with a suffix) | `unit.headline` |
| An answer: `$var.topic.label` | `var.topic` |
| A typed block with a name: `::: html scores` | `scores` |
| A script: `{{ ... }}` | None (put it in a named block to give it one) |

Values inside a typed block are part of the block's content: they have no
id of their own.

A block's name comes after its type: `::: markdown intro`,
`::: html scores`. A name is letters, digits and `_` (no dots), and must be
different from the other names in the layout (*Two blocks are named
'intro': names must be unique*).

### Focus on

Every question in a loop has **Focus on (optional)**: one or more of the ids
the layout shows, the parts of the unit the question is about. When the
question comes up, the unit scrolls to the first and highlights it briefly.
With **Dim the rest of the unit**, everything else fades back while the
question is on screen, so coders see at a glance what to look at: the
headline for the first question, a table further down for the next.

A [span question](span.md) focuses on the fields it selects in, unless you
choose otherwise.

If the layout no longer shows an id, the editor reports: *'unit.title' is
not shown in the layout (as $unit.title)*.

### Fields span questions select in

A [span question](span.md) lets coders select words in unit fields. It can
only select in a field the layout shows as **plain text**: `$unit.text`,
without a suffix and not inside a typed block. What coders select is then
exactly what is in your data, and the positions of the spans point into
the field as it was shown (kept in `units.csv`).

A field shown with `::markdown` or inside a typed block can't be selected
in. The editor then says *Span question 'actors' selects text in the unit
field 'text', but the layout doesn't show it as plain text ($unit.text)*.
