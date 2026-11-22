---
title: Relations
section: Question types
order: 9
summary: Relation questions - coders click two spans they marked to link them, as rules allow, with a label for how they relate.
---

A **Relations** question asks coders to link spans they marked earlier in
the same unit: _who criticizes whom_, which statement is the _evidence_
for which claim. The basis for networks of actors and arguments. Only in
unit loops.

## Setting up

**Options** are the kinds of relation, e.g. _criticizes_, _supports_.
Relations have a direction: name them to read _from … to_.

**Rules** say which relations coders can make. A rule has:

| Part      | Says                                                                 |
| --------- | -------------------------------------------------------------------- |
| **From**  | a [span question](span.md) earlier in the loop, and which of its labels (none chosen: any) |
| **To**    | the same or another span question, and which labels                   |
| **Types** | which kinds of relation this rule allows (none chosen: all)           |

For example, _persons and organisations criticize each other_ is one rule
(actors → actors, type _criticizes_); _organisations employ persons_ is
another (actors: organisation → actors: person, type _employs_). Add as
many rules as you need; a relation is allowed when any rule allows it.

## How coders make relations

In the text, the spans the rules use are shown as buttons:

1. Click a span where a relation can start; the others are dimmed.
2. Click where it goes: only spans the rules allow can be clicked.
3. If only one kind of relation fits, it is made at once; otherwise coders
   choose it under the question (with the shortcut style's keys, by
   default 1-9).

A faint arrow shows each relation in the text; pointing at it (or at one
of its spans) makes it solid, with the relation's name. Clicking the
arrow, or a relation in the list, opens it to change its kind; choosing a
kind it has removes it. **Esc** cancels a started relation.
**Done** counts the relations; **Skip** is stored as skipped, not as _no
relations_. A relation to itself is not possible. Coders can go back to add
a missing span; relations stay unless their spans were deleted.

> Linking is demanding. Pilot it, keep relation types few, and give
> examples in the instructions.

## What is stored

Per relation: its value and the ids of its two spans. In
`annotations.csv` it reads `value: from → to` with the span texts; the
`_json` column has span ids that match the span question's `_json`. See
[Downloading results](results.md).

## Using the answers

`$var.links.values`, `$var.links.labels`; in conditions
`$var.links.has("criticizes")` and `$var.links.count()`.
