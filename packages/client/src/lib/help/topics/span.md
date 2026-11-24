---
title: Selecting text (spans)
section: Question types
order: 8
summary: Span questions - coders select words in the unit's text and give each selection a label.
---

A **Mark text** (span) question lets coders select pieces of the unit's
text and label them: people and organisations, quotes, arguments, emotion
words. Each piece is a **span**. Only in unit loops.

## Setting up

| Setting                    | Does                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Select in**              | the unit fields coders can select in                                                                       |
| **Default Selection Mode** | **Word level** (snap to whole words, the default) or **Character level** (exact characters, e.g. hashtags) |
| **Options**                | the labels, e.g. _Person_, _Organisation_, with values and colours                                         |
| **Allow gaps**             | a span may have several pieces (a quote around _"she said"_)                                               |

Give options clearly different colours: that is how coders tell spans
apart.

### What coders can select in

Unit fields the layout shows **as plain text** (`$unit.text`, without a
suffix such as `::markdown` and not in a typed block, see
[Layout templates](layout-templates.md#values)), so what is selected is
exactly your data. Every layout that may apply to the question must show
them (see [Layout items](layout-templates.md#layout-items)). **Select in** lists them; click to switch on or off. A
red field is no longer plain text in the layout. One question can select
in several fields.

## How coders mark spans

1. **Select text**: drag, or click a word. A **Label as** menu appears
   (on phones, in the answer area).
2. Click a later word to extend the selection (with gaps: add or remove).
3. **Pick a label**: click it or press its key. **Esc** cancels.

With the keyboard: the arrows move over the words, **Space** starts a
selection, the arrows extend it and **Space** ends it; then pick a label
with the arrows and **Space**, or its key. **Ctrl + Enter** is **Done**.

Spans may overlap and the same text can have several labels. Clicking a
span shows its labels, with **Edit**, **Delete** and **Create new label**.
**View labeled spans** lists them all. **Done** counts the spans; **Done
(0)** is a valid answer.

> Say in the instructions what counts as a span (full names? titles?).
> Spans are where coders disagree most.

## What is stored

Per span: its label's value, the field, each piece's start and length (in
characters of your data), and the text. In `annotations.csv` the column
reads `person: Angela Merkel; organisation: European Commission`; the
`.json` column has the positions. A replaced unit's spans still point
into the version the coder saw (`units.csv` has every version).

## Using the answers

| Reference            | Gives              |
| -------------------- | ------------------ |
| `$var.actors.values` | the spans' values  |
| `$var.actors.labels` | their labels       |
| `$var.actors.texts`  | the selected texts |

Conditions: `$var.actors.has("person")`, `$var.actors.count()`. To link
spans, see [Relations](relation.md).
