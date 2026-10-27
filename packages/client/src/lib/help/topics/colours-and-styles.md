---
title: Colours and styles
section: Unit layouts
order: 4
summary: Font sizes, colours and boxes with ::: style, and a fixed light or dark look for a loop's units.
---

By default a unit looks like the rest of AnnoTinder: the same font, and
light or dark as each coder chose. Markdown gives you headings, bold text,
lists and quotes. When you need more, such as smaller grey instructions, a
box around a text, or two texts side by side, wrap that part of the template
in a `::: style` block. And when your material only looks right in light (or
dark) colours, the loop's **Colours** setting fixes them.

## Style blocks

`::: style` is followed by CSS, the language web pages are styled with:
declarations of the form `property: value`, separated by `;`. The lines up to
the closing `:::` get that style.

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

Style blocks work everywhere blocks do: inside `::: if` and `::: from`
blocks, around them, inside [snippets](snippets.md), and in question texts.
See [Showing parts conditionally](template-blocks.md) for how blocks nest.

### Useful properties

Any CSS property can be used. These are the ones you are most likely to need:

| Property | Example | Does |
| --- | --- | --- |
| `font-size` | `font-size: 120%` | Larger or smaller text, relative to the normal size |
| `font-weight` | `font-weight: 700` | Bold (400 is normal) |
| `font-style` | `font-style: italic` | Italic |
| `font-family` | `font-family: Georgia, serif` | Another font (one the coder's device has) |
| `color` | `color: darkred` | Text colour |
| `background` | `background: #fff8e1` | Background colour |
| `border` | `border: 1px solid var(--border)` | A line around the part |
| `border-radius` | `border-radius: 8px` | Rounded corners |
| `padding` | `padding: 0.75em 1em` | Space inside the border |
| `margin-top` | `margin-top: 1em` | Space above the part |
| `text-align` | `text-align: center` | Centred text |
| `max-width` | `max-width: 30em` | Keep lines short |
| `opacity` | `opacity: 0.7` | Fainter |

Prefer sizes in `%` or `em` (relative to the text around it) over `px`, so
the proportions stay right on every screen.

### A box

A border, rounded corners and some padding make a box, for instructions or
for the part coders must read:

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

Inside a style block, paragraphs follow each other without space between
them. To space them, add `display: flex; flex-direction: column; gap: 0.75em`
to the style.

### Side by side

`display: grid` with `grid-template-columns` puts the parts inside the block
next to each other. Here each column is a style block of its own (the outer
block has more colons, so you can see which `:::` closes which):

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

> Many coders use a phone. Two columns of text are narrow on a small screen:
> check the layout in the **Mobile** preview before you publish.

### Colours that follow light or dark

A colour written as a name or code, like `darkred` or `#fff8e1`, stays the
same in light and dark mode, and may be hard to read in one of them. These
colours of AnnoTinder's own theme change with it:

| Write | Colour |
| --- | --- |
| `var(--foreground)` | Normal text |
| `var(--muted-foreground)` | Grey text, for secondary information |
| `var(--background)` | The page background |
| `var(--muted)` | A soft background, for highlights |
| `var(--border)` | Lines and borders |
| `var(--primary)` | AnnoTinder's accent colour |
| `var(--destructive)` | Red, for warnings |

Use them where you can. When the material needs its own colours, fix the
look with the **Colours** setting (below).

### What isn't possible

A style block holds CSS declarations only: no selectors, class names,
`:hover` or media queries. It styles the text in the block, not the
answer buttons or the rest of the screen. The template editor reports:

- *"bold" is not a CSS declaration (property: value)*: each part between
  `;` needs a property, a colon and a value;
- *position: fixed isn't allowed: it would place the text over the app*:
  `position: fixed` and `position: sticky` would take the text out of the
  unit and over the questions, so they are refused.

HTML shown with `::html` or `::: html` sits in a frame of its own: a style
block around it doesn't change its text. Style that HTML from within (see
[HTML in a layout](html.md)).

### The Insert menu

**Insert** › **Style…** above the template writes a style block around the
text you selected: **Box**, **Small grey text**, **Large text**,
**Centered**, or **Custom CSS…** (a placeholder `property: value` to fill in).

## Light or dark

Coders choose a light or dark look for AnnoTinder (under **Settings**,
**Appearance**); until they choose, it follows their device. Ordinary
markdown and the theme colours above work in both. Material with its own
colours often doesn't: dark red text on a dark background, screenshots or
images with a white background, a mock social media post in its platform's
colours.

The **Colours** setting on the loop's **Layout** tab decides:

| Option | The unit is shown |
| --- | --- |
| **Follow the coder's light or dark mode** | In the coder's choice (the default) |
| **Always light** | Always in light colours, on a light background |
| **Always dark** | Always in dark colours, on a dark background |

With **Always light** or **Always dark**, only the unit gets fixed colours:
it is shown on its own background, with a little space around it. The
questions and the rest of the screen still follow the coder's choice.

Fix the colours when the material only works one way, and in experiments
where every participant should see the stimulus the same. In the JSON view
the setting is the layout's `colorScheme`: `"light"` or `"dark"`.

## The whole unit

To style the whole unit, put a `::: style` block around the whole template.
(In the JSON view, the layout also has a `style` property for the unit's
container, with property names written in camelCase, as in
`"style": { "fontSize": "110%" }`; a style block does the same and is easier
to read.)
