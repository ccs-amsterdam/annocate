---
title: Why templates work this way
section: Design notes
order: 5
summary: Why a unit is shown with one markdown template, why data is shown literally, why names are written out, and why HTML and scripts run in a sandbox.
---

How a unit is shown is part of your measurement instrument: coders judge
what they see. AnnoTinder's [layout templates](layout-templates.md) are
designed so that what coders see is predictable, the same for every coder,
and can be read and checked by someone else. This page explains the choices
behind them, and what they cost.

## One template instead of a form

Many annotation tools have you configure the display in a form: a list of
fields, each with a type and a position. AnnoTinder uses a single text
instead: [markdown](https://commonmark.org/help/) with the unit's data
filled in.

- **You can read it.** The template looks like the unit coders will see. A
  reviewer can read it in your replication materials without opening
  AnnoTinder.
- **Anything can go anywhere.** Headings, text between fields, a sentence
  with a value in the middle, a table, a field shown twice. A form only offers
  the arrangements its designer thought of.
- **One syntax everywhere.** Question texts, instructions and end messages
  use the same syntax, so a question can say *"Is **$unit.headline** about
  politics?"*.
- **It copies as text.** Templates are part of the codebook's JSON, so they
  move with it when you share a codebook.

The cost is a little syntax to learn. The **Insert** menu above the template
writes most of it for you, and the editor suggests unit fields and questions
as you type.

## Data is shown as it is

A value such as `$unit.text` is shown **exactly** as it is in your data. If a
tweet contains `*` or `#`, coders see `*` and `#`; they are not read as
markdown. Only when you add a suffix such as `::markdown` or `::html` is the
data read as formatting.

```example
unit:
  text: Vote *now* for **change** #election
---
Plain: $unit.text

As markdown: $unit.text::markdown
```

Showing data literally by default has three reasons:

- **Fidelity.** Coders judge the material as it is, character for
  character. A stray `**` in scraped text doesn't silently turn half an
  article bold.
- **Robustness.** Odd characters in thousands of units can't break the layout
  of one of them.
- **Text selection.** A [span](span.md) is stored as a position in the text.
  That only works if the text on screen is exactly the text in the data, so
  span questions select in plain-text fields only.

When your data *is* formatted (articles you prepared as markdown or HTML),
you say so once, with the suffix. See
[Text is shown as text](layout-templates.md#text-is-shown-as-text).

## Names are written out in full

References name a field or question literally: `$unit.headline`,
`$var.topic.label`. You can't build a name from pieces, such as "the field
whose name is in another field". This is a restriction, and it buys a lot:

- **Every reference can be checked.** The editor knows exactly which fields
  and questions a template uses, so a typo or a question that comes later in
  the codebook is an error before you publish, not an empty space coders run
  into.
- **Coders get only what is used.** AnnoTinder sends coders only the unit
  fields the codebook refers to. Metadata columns you uploaded for your
  analysis (a source id, a classifier score, the expert answer) stay on the
  server, unless the codebook uses them.
- **Unit versions are exact.** What a coder saw is the set of fields used,
  so AnnoTinder can store it. See
  [Keeping track of what coders saw](design-what-coders-saw.md).

To show different things in different cases, write each case out, with
[`::: if` blocks](template-blocks.md).

## Two steps: text first, then values

A template is read in two steps:

1. **The text is put together.** [Snippets](snippets.md) are pasted in, and
   [blocks](template-blocks.md) choose which parts are shown.
2. **The values are filled in**, and the result is shown.

Values come last, so data can never change the template. If a unit's text
happens to contain `[[instructions]]`, `$var.topic` or a line starting with
`:::`, coders simply see those characters. Your template decides what is
shown; your data only fills it in.

## HTML only in a sandbox

Some material is best prepared as HTML: a formatted article, a table, a mock
social media post. AnnoTinder shows HTML only where you ask for it (`::html`
or `::: html`), and then in a sealed frame: it can't load anything from the
internet, can't reach the coder's session or the rest of the page, and can't
send coders elsewhere.

That protects coders and your data, also when the HTML comes from data you
didn't write yourself (scraped web pages, for example). The cost: the frame
doesn't follow the app's fonts or dark mode, and images must be included in
the HTML itself. See [HTML in a layout](html.md). Prefer markdown when it can
do the job.

## Scripts in a sandbox

[Scripts](scripts.md) (`{{ ... }}` in templates, and advanced conditions)
are short JavaScript expressions. They run in a separate, sealed engine:

- they only see `$unit` and `$var`, nothing of the coder's browser;
- each one may run for at most a tenth of a second and use little memory;
- a script that fails shows nothing (in a template) or counts as false (in a
  condition), instead of stopping the coder.

Why JavaScript rather than a language of its own? Many researchers have seen
it, it is well documented, and R can run it too (with the `V8` package), so
a script in a published codebook can be checked outside AnnoTinder.

Most conditions don't need a script at all: the **Rules** editor writes
simple conditions, which AnnoTinder can check in more detail (for example,
that a value you compare with is one of the question's options).

## What templates don't do

- **No layout per device.** The same template is shown on every screen; it
  wraps to the screen's width. See
  [The same form on every device](design-fixed-layouts.md).
- **No content from elsewhere**, except images by URL. HTML frames can't load
  anything, and scripts can't fetch data.
- **No styling rules for the whole page.** `::: style` styles the block it
  wraps; it can't change the rest of the app or pin things to the screen.
  See [Colours and styles](colours-and-styles.md).
