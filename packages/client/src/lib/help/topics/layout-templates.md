---
title: Layout templates
section: Unit layouts
order: 2
summary: How a unit is shown to coders - one markdown text with the unit's data filled in.
---

Every unit loop has a **layout**: the text coders see above the questions, for
each unit. You write it once, as a template, and AnnoTinder fills in each
unit's data. You find it on the loop's **Layout** tab in the codebook editor.

The template is [markdown](https://commonmark.org/help/), the plain-text format
for headings, bold text, lists and links, with **values** in it: places where
something is filled in, such as a column of your units.

```example
unit:
  headline: Storm hits the coast
  source: Daily Planet
  text: Heavy rain and wind caused flooding in several towns on Tuesday. Residents were evacuated as water levels kept rising.
---
# $unit.headline

*Published by $unit.source*

$unit.text
```

This and the other examples in the help are live: change the template and see
what coders would see. Try adding `**Source:** $unit.source` on a new line.

## Values

There are three kinds of values:

| Write | What is filled in |
| --- | --- |
| `$unit.headline` | The unit's `headline` field: a column of the units you uploaded |
| `$var.topic.label` | The coder's answer to the question `topic` (see [Referring to answers and unit data](references.md)) |
| `{{ ... }}` | The result of a small script, for anything else (see [Scripts](scripts.md)) |

The editor helps you: type `$` and it lists the unit fields and questions you
can use. Fields that don't exist in the job's units are marked with a warning,
so a typo doesn't go unnoticed.

```example
unit:
  headline: Storm hits the coast
  likes: 128
  shares: 17
---
## $unit.headline

This article was liked $unit.likes times and shared $unit.shares times,
{{ $unit.likes + $unit.shares }} reactions in total.
```

A value that is empty (a missing field, or a question that isn't answered)
shows nothing. To write a dollar sign followed by a name, write `\$`:
`\$unit.headline` shows `$unit.headline`.

## Text is shown as text

A value is shown **exactly as it is in the data**. If the text of a unit
contains `**`, `#` or `<b>`, coders see those characters: they are not read as
markdown or HTML. That is almost always what you want for research material:
what coders see is what is in your data, character for character, and texts
with odd characters (code, tweets with `*` and `#`) can't break the layout.

```example
unit:
  text: Breaking: #storm hits the *coast*, <b>evacuations</b> ordered
---
$unit.text
```

## Suffixes: showing a value as something else

When a field *does* contain markdown, an image link or HTML, add a **suffix**
after the value to say how to show it:

| Suffix | Shows the value as |
| --- | --- |
| `::text` | Plain text. The default, so you never need to write it |
| `::markdown` | Markdown: `**bold**` becomes **bold** |
| `::image` | An image: the value is the image's URL |
| `::html` | HTML, in a safe frame (see [HTML in a layout](html.md)) |

```example
unit:
  body: |
    The storm hit **three towns**:

    - Smallville
    - Riverdale
  photo: https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg
---
$unit.body::markdown

$unit.photo::image
```

> Images come from wherever their URL points to. Use URLs that stay
> available for as long as the job runs.

A suffix also works after a script: `{{ $unit.text.toUpperCase() }}::markdown`.
It goes *after* the closing `}}`, never inside it.

## Markdown in the template itself

Everything around the values is ordinary markdown, so you can structure the
unit as you like:

- `# Heading`, `## Smaller heading`
- `**bold**` and `*italic*`
- lists with `-` or `1.`
- `> quoted text`
- links: `[the source]($unit.url)`. Values work inside link addresses too
- tables, with `|` between the cells
- `---` on its own line for a horizontal line

A value that stands alone on its line becomes a paragraph of its own; a value
inside a sentence stays part of that sentence.

## Beyond values

The template can do more than fill in values. Each has its own page:

- [Show parts conditionally](template-blocks.md): `::: if` shows text only to
  some coders or for some units, `::: from` changes the unit as the coder goes
  through its questions.
- [Colours and styles](colours-and-styles.md): `::: style` for font sizes,
  colours and boxes, and a fixed light or dark look.
- [Snippets](snippets.md): name a piece of the template and reuse it.
- [Typed blocks and names](typed-blocks.md): show a larger piece as markdown
  or HTML, and name it so span questions can select in it.

The **Insert** menu above the template writes most of these for you.

## Questions in a loop use the same syntax

Question and instruction texts are templates too. In a loop they can use the
unit's data, so a question can say *"Is **$unit.headline** about politics?"*.
Outside a loop there is no unit, so texts can only use answers (`$var`).
