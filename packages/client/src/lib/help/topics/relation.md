---
title: Relations
section: Question types
order: 9
summary: Relation questions - link two spans that coders selected, with a label for how they relate.
---

A **Relations** question asks coders to link spans they marked earlier in
the same unit: _who criticizes whom_, which statement is the _evidence_
for which claim. The basis for networks of actors and arguments. Only in
unit loops.

## Setting up

| Setting                  | Does                                                    |
| ------------------------ | ------------------------------------------------------- |
| **Options**              | the kinds of relation, e.g. _criticizes_, _supports_    |
| **From (span question)** | the span question where a relation starts               |
| **To (span question)**   | the span question where it ends                         |

From and To must be [span questions](span.md) **earlier in the loop**;
they can be the same (actors to actors) or differ (actors to issues).
Relations have a direction: name options to read _from … to_.

To offer only some spans, add `values` in the JSON view:

```json
"from": { "variable": "actors", "values": ["person"] },
"to": { "variable": "actors" }
```

## How coders link spans

Coders pick **Select from …**, the kind of relation, and **Select to …**,
then click **Link**. The cross removes a relation. **Done** counts them;
**Skip** is stored as skipped, not as _no relations_. Coders can go back to
add a missing span; relations stay unless their spans were deleted.

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
