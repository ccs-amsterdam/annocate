---
title: Typed blocks and names
section: Unit layouts
order: 5
summary: Show a larger piece of a layout as markdown, plain text, HTML or an image, and name it so questions can point at it.
---

A [suffix](layout-templates.md#suffixes-showing-a-value-as-something-else)
shows one value as markdown, an image or HTML. A **typed block** does this
for a larger piece, with your own text and several values: the content is
put together first, then shown as one thing. A block can also get a
**name**, so questions can point at it.

```template
::: markdown
**$unit.speaker** said: $unit.quote
:::
```

## The four types

| Block          | Shows its content as                                   |
| -------------- | ------------------------------------------------------ |
| `::: text`     | plain text, line breaks kept                           |
| `::: markdown` | markdown, also markdown inside the values              |
| `::: html`     | HTML in a safe frame (see [HTML in a layout](html.md)) |
| `::: image`    | an image; the content is its URL                       |

`$unit.body::markdown` is short for a markdown block around `$unit.body`.

### Values are put in as they are

Inside a markdown block, markdown in the values is read too:

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

Careful: then every `*` or `_` in a tweet counts. For plain texts, values
outside a block are safer.

### Text blocks

Combine values into one plain text, e.g. to give it a name for
[Focus on](#focus-on):

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

### Image blocks

Build an image URL from parts:

```example
unit:
  file: a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg
---
::: image
https://upload.wikimedia.org/wikipedia/commons/thumb/$unit.file
:::
```

### Rules

- **No suffixes inside** a typed block (_leave out ::markdown_).
- **No typed blocks inside typed blocks.** They can be inside `::: if`,
  `::: from` and `::: style`, and the other way round.
- **`::: style` only inside markdown.** In HTML, use `style="..."`.
- Fences go on their own lines; close with `:::`.

## Ids

Parts of a layout get **ids** that questions can refer to:

| The layout shows                      | Id                             |
| ------------------------------------- | ------------------------------ |
| `$unit.headline` (also with a suffix) | `unit.headline`                |
| `$var.topic.label`                    | `var.topic`                    |
| a named block: `::: html scores`      | `scores`                       |
| a script `{{ ... }}`                  | none (put it in a named block) |

The name follows the type (`::: markdown intro`): letters, digits and
`_`, unique in the layout. Values inside a block have no id of their own.

### Focus on

A loop question's **Focus on (optional)** picks ids the question is about:
the unit scrolls there and highlights it; **Dim the rest of the unit**
fades the rest. If the layout no longer shows an id, the editor says so.

### Fields span questions select in

A [span question](span.md) can only select in fields shown as **plain
text** (`$unit.text`, no suffix, not in a typed block), so selections match
your data exactly.
