---
title: Colours and styles
section: Unit layouts
order: 4
summary: Font sizes, colours and boxes with ::: style, and a fixed light or dark look for the study.
---

Markdown gives headings, bold, lists and quotes. For more (smaller grey
instructions, a box, two texts side by side), wrap part of the template in
a `::: style` block. **Insert** › **Style…** above the template writes one
for you: **Box**, **Small grey text**, **Large text**, **Centered** or
**Custom CSS…**.

## Style blocks

`::: style` is followed by CSS declarations (`property: value`, separated
by `;`) for the lines up to `:::`:

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
---
::: style font-size: 90%; color: var(--muted-foreground)
Read the article, then answer the questions below.
:::

::: style font-size: 130%; font-weight: 700; color: darkred
$unit.headline
:::

$unit.text
```

Style blocks work inside and around other blocks, in
[snippets](snippets.md) and question texts, and inside `::: markdown`, but
not inside `::: text`, `::: html` or `::: image` (see
[Typed blocks and names](typed-blocks.md#rules)).

### Useful properties

| Property                     | Example                           |
| ---------------------------- | --------------------------------- |
| `font-size`                  | `font-size: 120%`                 |
| `font-weight`, `font-style`  | `font-weight: 700`, `font-style: italic` |
| `font-family`                | `font-family: Georgia, serif`     |
| `color`, `background`        | `color: darkred`, `background: #fff8e1` |
| `border`, `border-radius`    | `border: 1px solid var(--border)`, `border-radius: 8px` |
| `padding`, `margin-top`      | `padding: 0.75em 1em`             |
| `text-align`, `max-width`    | `text-align: center`, `max-width: 30em` |
| `opacity`, `gap`             | `opacity: 0.7`, `gap: 0.5em`      |

Use `%` or `em` rather than `px`, so proportions hold on every screen.

### A box

```example
unit:
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
---
::: style border: 1px solid var(--border); border-radius: 8px; padding: 0.75em 1em
**Instructions:** read the article and decide whether it is about the
weather, the response of the authorities, or both.
:::

$unit.text
```

### Side by side

```example
unit:
  left: The government announced new measures against flooding.
  right: Residents say the government ignored warnings for years.
---
:::: style display: grid; grid-template-columns: 1fr 1fr; gap: 1em
::: style border: 1px solid var(--border); border-radius: 8px; padding: 0.5em
**Article A:** $unit.left
:::
::: style border: 1px solid var(--border); border-radius: 8px; padding: 0.5em
**Article B:** $unit.right
:::
::::
```

> Two columns are narrow on a phone: check the **Mobile** preview.

### Colours that follow light or dark

Named colours (`darkred`, `#fff8e1`) stay the same in light and dark mode
and may be hard to read in one. These follow the theme:

| Write                     | Colour                     |
| ------------------------- | -------------------------- |
| `var(--foreground)`       | normal text                |
| `var(--muted-foreground)` | grey, secondary text       |
| `var(--background)`       | page background            |
| `var(--muted)`            | soft background            |
| `var(--border)`           | lines and borders          |
| `var(--primary)`          | accent colour              |
| `var(--destructive)`      | red, for warnings          |

### What isn't possible

Only declarations: no selectors, classes, `:hover` or media queries, and
only the text in the block (not the answer buttons). Only properties that
change how text and boxes look: colours, fonts, spacing, borders, sizes,
flex and grid. Positioning (`position`, `z-index`, `transform`) and
anything that loads something (`url(…)`, so no background images) are
refused: use `::: image` for images. HTML from `::html` sits in its own frame; style it
from within (see [HTML in a layout](html.md)).

## Light or dark

Coders choose light or dark under **Settings** → **Appearance** (or follow
their device). Markdown and the theme colours above work in both; material
with its own colours (dark red text, images on white, a mock social media
post) often doesn't.

Then set **Display** (above the item tree) → **Light or dark** to
**Always light** or **Always dark**. The whole coding screen then uses
that theme for every coder, and coders can't switch. Do this also in
experiments where every coder should see the stimulus the same.

## The whole unit

Put a `::: style` block around the whole template.
