---
title: HTML in a layout
section: Unit layouts
order: 7
summary: Show prepared HTML - tables, formatted articles, mock social media posts - in a safe frame.
---

For material markdown can't do (tables with merged cells, scraped
articles, a mock social media post), a layout can show **HTML**. It is
always shown in a sealed frame, a **sandbox**: it can't reach the coder's
session, the page or the internet, so HTML from your data is safe.

## Two ways to show HTML

**HTML from your data**: add `::html` to the value:

```example
unit:
  table: <table style="border-collapse: collapse; font-family: system-ui, sans-serif"><tr><th style="border: 1px solid #ccc; padding: 4px 8px" colspan="2">Seats in parliament</th></tr><tr><td style="border: 1px solid #ccc; padding: 4px 8px">Greens</td><td style="border: 1px solid #ccc; padding: 4px 8px">12</td></tr><tr><td style="border: 1px solid #ccc; padding: 4px 8px">Liberals</td><td style="border: 1px solid #ccc; padding: 4px 8px">31</td></tr></table>
---
## Election results

$unit.table::html
```

Without it, coders see the code (see
[Text is shown as text](layout-templates.md#text-is-shown-as-text)).

**HTML you write**: a `::: html` block (**Insert** › **HTML block**), with
the unit's values put in:

```example
unit:
  name: Daily Planet
  handle: dailyplanet
  text: Storm hits the coast. Several towns flooded, residents evacuated.
  likes: 2400
---
::: html
<div style="font-family: system-ui, sans-serif; max-width: 30em; border: 1px solid #cfd9de; border-radius: 16px; padding: 12px 16px; background: #ffffff; color: #0f1419">
  <div><b>$unit.name</b> <span style="color: #536471">@$unit.handle</span></div>
  <p style="margin: 6px 0 10px">$unit.text</p>
  <div style="color: #536471; font-size: 14px">♥ $unit.likes</div>
</div>
:::
```

Inside the block values are put in as they are (`<b>` makes bold; a `<` in
plain text may be read as HTML). Each frame is on its own line, full
width. A named block (`::: html scores`) can be a question's **Focus on**
(see [Typed blocks and names](typed-blocks.md)).

## What the sandbox doesn't allow

| In the HTML                        | In the frame                                                     |
| ---------------------------------- | ---------------------------------------------------------------- |
| `<script>`, `onclick="..."`        | don't run                                                        |
| images from the web                | don't load (only `data:` URLs); use `$unit.photo::image` outside |
| stylesheets and fonts from the web | don't load; use `<style>` and `style="..."`                      |
| forms, buttons, links              | can't send anything or leave the coding screen                   |

## How the frame looks

- As wide as the unit, as tall as its content (cut off after 8000 pixels).
  Wider content is cut off: use `max-width: 100%`, and check **Mobile**.
- A plain style close to AnnoTinder's, which your CSS overrides.
- Text colours follow light or dark, on a transparent background. HTML
  with its own colours should set its own background, or set **Display** →
  **Light or dark** (see [Light or dark](colours-and-styles.md#light-or-dark)).
- A `::: style` block around it doesn't reach inside.

Prefer markdown when it can do the job: it follows the theme, fits phones,
and [span questions](span.md) can select in it.
