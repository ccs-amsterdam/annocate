---
title: HTML in a layout
section: Unit layouts
order: 7
summary: Show prepared HTML - tables, formatted articles, mock social media posts - in a safe frame.
---

Markdown covers most layouts: headings, bold text, lists, quotes, simple
tables. Some material needs more: a table with merged cells, an article
scraped from a news site with its own formatting, or a mock social media post
for a survey experiment. For that, a layout can show **HTML**, the language
of web pages.

AnnoTinder shows HTML only where you ask for it, and always in a sealed
frame, a **sandbox**: whatever the HTML contains, it can't reach the coder's
session, the rest of the page or the internet. That makes it safe to show
HTML from data you didn't write yourself.

## Two ways to show HTML

**HTML from your data.** When a unit field contains HTML, add the suffix
`::html` to its value:

```example
unit:
  table: <table style="border-collapse: collapse; font-family: system-ui, sans-serif"><tr><th style="border: 1px solid #ccc; padding: 4px 8px" colspan="2">Seats in parliament</th></tr><tr><td style="border: 1px solid #ccc; padding: 4px 8px">Greens</td><td style="border: 1px solid #ccc; padding: 4px 8px">12</td></tr><tr><td style="border: 1px solid #ccc; padding: 4px 8px">Liberals</td><td style="border: 1px solid #ccc; padding: 4px 8px">31</td></tr></table>
---
## Election results

$unit.table::html
```

Without the suffix, coders would see the HTML code itself (see
[Text is shown as text](layout-templates.md#text-is-shown-as-text)).

**HTML you write.** A `::: html` block shows its content as HTML, with the
unit's values put in. **Insert** › **HTML block** writes one for you. This
mock post is the same for every unit, with each unit's data filled in:

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

Inside a `::: html` block, values are put in as they are: a value that
contains `<b>` makes bold text, and a `<` or `&` in ordinary text can be read
as HTML. That is what you want for prepared HTML; for raw texts, show them
outside the block, where they are always shown as text.

Put `::html` values and `::: html` blocks on lines of their own: each is
shown as a frame of its own, the full width of the unit. A block can have a
name (`::: html scores`), so that a question can **Focus on** it
(see [Typed blocks and names](typed-blocks.md)).

## What the sandbox doesn't allow

The frame is sealed off from everything else. That has consequences for what
HTML can do:

| In the HTML | In the frame |
| --- | --- |
| `<script>` and `onclick="..."` | Don't run: only AnnoTinder's own script, which sizes the frame, runs |
| Images from the web: `<img src="https://...">` | Don't load: only images included in the HTML itself, as `data:` URLs |
| Stylesheets and fonts from the web | Don't load: use `<style>` and `style="..."` in the HTML, and fonts the device has |
| Forms and buttons | Can't send anything |
| Links | Can't open new windows or leave the coding screen |

The HTML also can't see the coder's answers, their session or anything else
in AnnoTinder, and nothing is sent anywhere.

For an image from the web, show it outside the HTML, with
`$unit.photo::image` (see [Layout templates](layout-templates.md)).

## How the frame looks

The frame is as wide as the unit, and as tall as its content: it grows when
the content does. (Very long content is cut off after 8000 pixels.)

The frame is a page of its own. It starts with a plain style close to
AnnoTinder's, which your HTML's own CSS overrides:

- **Fonts**: AnnoTinder's font if the coder's device has it, else the
  device's own sans-serif font.
- **Light and dark**: the text colour, link colour and table borders follow
  the coder's light or dark mode (or the loop's **Colours**, see
  [Light or dark](colours-and-styles.md#light-or-dark)), and the background
  is transparent. HTML that sets its own colours keeps them: give it its own
  background too, or set **Colours** to **Always light**.
- **Width**: content wider than the unit is cut off, not scrolled. Use
  `max-width: 100%` on images and tables, and check the layout in the
  **Mobile** preview.
- **Styles from the template**: a `::: style` block around the HTML doesn't
  reach inside the frame. Style the HTML itself.

## When to use HTML

HTML is useful for material that is prepared outside AnnoTinder and must look
exactly so:

- tables with merged cells, colours or alignment that markdown can't do;
- articles scraped from websites, with their formatting;
- stimuli that imitate a platform, such as a post, a search result or an
  advertisement, in experiments;
- score cards and other small designs built from a unit's numbers.

Prefer markdown when it can do the job. Markdown follows the coder's light
or dark mode and the app's fonts, fits phone screens by itself, and its text
can be selected by [span questions](span.md): text in a frame can't.
