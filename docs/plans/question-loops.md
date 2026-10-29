# Plan: question loops

Status: idea from the project lead, written down, not designed in detail
(2026-10-28).

## Goal

Ask the same questions once per value of a list, where the list is known
only while coding. Examples:

- **Per span:** for every actor a coder marked in the text, ask the actor's
  stance; focus on that span while asking.
- **Per candidate:** a unit carries its own topic candidates (e.g. from a
  classifier); ask "is this topic present?" for each.
- **Per listed value:** a fixed list in the item, e.g. a few parties, each
  asked the same scale (like a scale question, but with several questions
  per value).

## 1. The item

A new item type, the **question loop**, next to the unit loop:

```json
{
  "type": "questionLoop",
  "name": "actor",
  "over": "$var.actors.codes",
  "key": "$var.actor.id",
  "items": [ { "type": "question", "name": "stance", ... } ]
}
```

- `over`: any list: annotations of an earlier question (span codes,
  multiple answers), a unit field holding a list, or a list written in the
  item.
- Inside, the current value is `$var.<loop name>` (here `$var.actor`): its
  fields (a span's `code`, `text`, `id`), and `index`.
- `key`: what makes each value unique and stable (a span id, the value
  itself). Answers are stored per key, so reordering or adding values
  doesn't move answers to another value. Required; validation says so.
- `focus` on questions inside can name the value (`$var.actor`), so a span
  is scrolled to and highlighted (`focus` today takes field and block ids).
- It can sit inside a unit loop or outside it; question loops can't nest at
  first.

## 2. Storage and export

- Answers are identified by (unit, coder, variable) today
  (`annotation_values_live`). A loop answer adds a key: a new
  `item_key` column (empty outside question loops), part of that unique
  index. A migration, not a change in meaning.
- Export: one row per key, with a `<loop name>_key` column, and the value's
  readable form (e.g. the span text) for convenience.

## 3. Coder experience

- Each value is a step in the navigation ("stance: Rutte", "stance:
  Timmermans"), so coders can go back to one.
- When the list changes after answering (a span is deleted), answers for
  keys that no longer exist are hidden and stored as skipped, like answers
  to questions whose condition turned false.

## 4. Open points

- Whether an empty list skips the loop silently, or can show a message.
- The editor: picking `over` and `key` from what the codebook has (span
  questions, unit fields), and previewing a loop with example values.
- Conditions inside the loop on the current value (e.g. only for actors of
  type "person"): should work with the existing condition language once
  `$var.<loop>` is in scope.
- Distribution and gold checks (`gold-checks.md`) don't need to know
  about question loops.
