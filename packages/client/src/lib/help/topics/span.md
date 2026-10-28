---
title: Selecting text (spans)
section: Question types
order: 8
summary: Span questions - coders select words in the unit's text and give each selection a label.
---

A **Span (select text)** question lets coders mark pieces of the unit's text
and give each piece a label: the people and organisations in a news
article, the quotes in it, the sentences that contain an argument, the
words that express an emotion. Each marked piece is a **span**.

Span questions only work inside a unit loop, because they need a unit's
text to select in.

## Setting up a span question

| Setting | What it does |
| --- | --- |
| **Select in** | The parts of the unit coders can select in (see below) |
| **Default Selection Mode** | Whether selections snap to whole words or not |
| **Options** | The labels coders give to spans, e.g. *Person*, *Organisation*, *Place* |
| **Allow gaps (discontinuous spans with multiple fragments)** | Whether one span can consist of several separate pieces |

The **Options** are like those of a [nominal question](nominal-and-ordinal.md):
a label coders see, a value that is stored, and a colour. Give span options
clearly different colours: the colour is how coders tell spans apart in the
text.

### What coders can select in

Coders can only select in text that the loop's layout shows **as plain
text**, so that what they select is exactly what is in your data. There are
two kinds:

- **A unit field shown with a plain value**, such as `$unit.text` or
  `$unit.headline`, without a suffix such as `::markdown` (see
  [Layout templates](layout-templates.md#values)). It is called
  `unit.text`, `unit.headline`.
- **A named text block**: a `::: text` block with a name, for text that is
  put together from several parts (see [Typed blocks and names](typed-blocks.md)).

**Select in** lists everything the layout shows this way; click a name to
switch it on or off. A name in red is no longer shown as plain text in the
layout: fix the layout, or switch the name off. If the list is empty, the
layout has nothing to select in yet.

One question can select in several parts at once, for example in both the
headline and the text: each span remembers where it is.

### Words or characters

**Default Selection Mode** has two settings:

- **Word level (snap selections to whole words)**: a selection always
  covers whole words, even if the coder starts or ends halfway through one.
  Clicking a single word selects it. This is the default, and what you want
  for most coding: it is quicker, and coders don't produce spans that differ
  by a letter.
- **Character level (select exact characters)**: coders select exactly
  the characters they want, by dragging. Use it when parts of words matter,
  as in morphology or hashtags.

Coders can't change this setting themselves.

### Gaps

Normally a span is one continuous piece of text. With **Allow gaps**, a span
can consist of several pieces (*fragments*), for example a quote that is
interrupted by *"she said"*. Coders then click or select further words to
add them to the span, and click them again to take them out.

Coders can always change and delete their spans.

## How coders select spans

While a span question is on screen, the text it selects in reacts to the
mouse or finger:

1. **Select text**: drag over it, or click a word (in word mode). The
   selection is highlighted, and the answer area shows **Label as:** with
   a button per option.
2. **Adjust the selection** if needed: clicking a later word extends it to
   there (with gaps, clicking a word adds or removes it).
3. **Pick a label**: click an option, or press its number key (**1** to
   **9**). **Esc** cancels the selection.

The span now shows in the text in the option's colour. Coders can mark as
many spans as they like, and the same text can have more than one label: a
name can be both a *Person* and a *Source*. Where spans overlap, they are
shown with stacked underlines.

**Clicking a marked span** shows its labels, with **Edit** to change or
**Delete** a label, and **Create new label** to give the same text another
label. **View labeled spans** lists all spans of the unit, for a quick check
before going on.

When they are done, coders click **Done**; the button counts the spans.
**Done (0)** is a valid answer: the coder found nothing to mark.

> Tell coders in the instruction what counts as a span: whole names or
> surnames only? With or without titles? Spans are where coders disagree
> most, and clear rules help reliability more than anything else.

## What is stored

For every span, AnnoTinder stores:

- the **value** of its label (e.g. `person`);
- **where** it is: the name of the part it is in (`unit.text`) and, for each
  fragment, the position of its first character and its length;
- the **text** that was selected.

Positions count characters in the field as it is in your data (for a named
text block: in the block's text), so you can find the spans again in your
own copy of the texts.

In the downloaded `annotations.csv`, a span question's column lists the spans
as `value: text`, separated by `; `, for example
`person: Angela Merkel; organisation: European Commission`. Its `_json`
column has everything, including the positions. See
[Downloading results](results.md).

> If you replace a unit after it was coded, its spans still point into the
> version the coder saw. `units.csv` has a row for each version.

## Using the answers

| Reference | Gives |
| --- | --- |
| `$var.actors.values` | the values of all spans, e.g. `person, person, organisation` |
| `$var.actors.labels` | their labels |
| `$var.actors.texts` | the selected texts |

Conditions can ask whether a span with a label was marked
(`$var.actors.has("person")`) or how many spans there are
(`$var.actors.count()`). See [Conditions](conditions.md).

A second question can link spans to each other: see [Relations](relation.md).
