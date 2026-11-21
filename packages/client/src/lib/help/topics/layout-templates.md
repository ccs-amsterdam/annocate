---
title: Layout templates
section: Unit layouts
order: 2
summary: How a unit is shown to coders - one markdown text with the unit's data filled in.
---

A unit loop's **Layout** tab sets what coders see of each unit, above the
questions.

**The simple way**: a sketch with a **Title**, **Byline** and **Body**.
Click a place to choose a field, drag a field onto it, or click a field to
add it to the body.

**The template**: **Advanced** opens the template behind the sketch, for
anything more (styles, conditions, snippets). It is
[markdown](https://commonmark.org/help/) with **values** filled in per
unit:

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

The examples in the help are live: edit the template and see the result.

## Values

| Write              | Filled in                                                       |
| ------------------ | --------------------------------------------------------------- |
| `$unit.headline`   | the unit's field `headline`                                     |
| `$unit.id`         | the unit's id                                                   |
| `$var.topic.label` | an earlier answer (see [Referring to answers and unit data](references.md)) |
| `{{ ... }}`        | a small script (see [Scripts](scripts.md))                      |

Type `$` for a list of what you can use. Unknown fields get a warning.
Empty values show nothing; `\$unit.headline` shows the text itself.

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

## Text is shown as text

A value is shown **exactly as in your data**: `**`, `#` or `<b>` in a
unit's text are shown as characters, not as markdown or HTML. Coders see
what is in your data, and odd characters can't break the layout.

```example
unit:
  text: Breaking: #storm hits the *coast*, <b>evacuations</b> ordered
---
$unit.text
```

## Suffixes: showing a value as something else

| Suffix       | Shows the value as                                     |
| ------------ | ------------------------------------------------------ |
| `::text`     | plain text (the default)                               |
| `::markdown` | markdown                                               |
| `::image`    | an image from the URL in the value                     |
| `::html`     | HTML, in a safe frame (see [HTML in a layout](html.md)) |

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

Use image URLs that stay available while the study runs. After a script,
the suffix goes after the braces: `{{ ... }}::markdown`.

## Markdown in the template

Around the values: `# Heading`, `**bold**`, `*italic*`, lists, `> quotes`,
links (`[the source]($unit.url)`), tables, and `---` for a line. A value
alone on its line is a paragraph; inside a sentence it stays in the
sentence.

## Beyond values

- [Showing parts conditionally](template-blocks.md): `::: if` and
  `::: from`.
- [Colours and styles](colours-and-styles.md): `::: style`.
- [Snippets](snippets.md): reusable pieces.
- [Typed blocks and names](typed-blocks.md): larger pieces as markdown or
  HTML, named for questions.

The **Insert** menu above the template writes most of these for you.
Question texts use the same syntax.
