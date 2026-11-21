---
title: Why templates work this way
section: Design notes
order: 5
summary: Why a unit is shown with one markdown template, why data is shown literally, why names are written out, and why HTML and scripts run in a sandbox.
---

How a unit is shown is part of your instrument. [Layout templates](layout-templates.md)
are designed so what coders see is predictable, the same for every coder,
and checkable by others.

## One template instead of a form

A single markdown text with the unit's data filled in:

- **readable**: it looks like the unit, also in replication materials;
- **flexible**: anything anywhere (text between fields, a value in a
  sentence, a table);
- **one syntax** for layouts, question texts and end messages;
- **copies as text** with the design.

The cost is a little syntax; the **Insert** menu and suggestions help.

## Data is shown as it is

`$unit.text` is shown exactly as in your data: `*` and `#` stay
characters. Only a suffix (`::markdown`, `::html`) reads data as
formatting.

```example
unit:
  text: Vote *now* for **change** #election
---
Plain: $unit.text

As markdown: $unit.text::markdown
```

This keeps material faithful, keeps odd characters from breaking layouts,
and lets [spans](span.md) store exact positions. See
[Text is shown as text](layout-templates.md#text-is-shown-as-text).

## Names are written out in full

References are literal (`$var.topic.label`), never built from pieces. So:

- every reference is checked before you deploy;
- coders only receive the fields the design uses (metadata stays on the
  server);
- unit versions record exactly what was seen (see
  [Keeping track of what coders saw](design-what-coders-saw.md)).

For different cases, write each out with [`::: if`](template-blocks.md).

## Text first, then values

Snippets and blocks are resolved first, values filled in last, so data can
never change the template: a unit containing `[[instructions]]` or `:::`
just shows those characters.

## HTML only in a sandbox

HTML is shown only where you ask (`::html`, `::: html`), in a sealed frame
that can't load anything, reach the session or send coders away: safe
also for scraped pages. The cost: images must be embedded. See
[HTML in a layout](html.md).

## Scripts in a sandbox

[Scripts](scripts.md) run in a sealed engine: they see only `$unit`,
`$var` and `$session`, run at most a tenth of a second, and a failure shows
nothing or counts as false. JavaScript because many know it and R can run
it (`V8`), so published scripts can be checked. Most conditions need only
the **Rules** editor, which is checked more strictly.

## What templates don't do

- No content from elsewhere, except images by URL.
- No page-wide styling: `::: style` styles its block (see
  [Colours and styles](colours-and-styles.md)).
- One template for every screen; text wraps (see
  [The same form on every device](design-fixed-layouts.md)).
