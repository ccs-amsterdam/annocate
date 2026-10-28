---
title: Relations
section: Question types
order: 9
summary: Relation questions - link two spans that coders selected, with a label for how they relate.
---

A **Relation (link spans)** question asks coders to connect spans they
marked earlier in the same unit, and to say how they are connected. For
example: after marking the actors in a news article with a
[span question](span.md), coders link *who criticizes whom*, *who supports
whom*, or which statement is the *evidence* for which claim. This is the
basis of network analyses of actors, claims and arguments.

Like span questions, relation questions only work inside a unit loop.

## Setting up a relation question

A relation question builds on one or two span questions **earlier in the
same loop**:

| Setting | What it does |
| --- | --- |
| **Options** | The kinds of relation, e.g. *criticizes*, *supports*, *agrees with* |
| **From (span variable)** | The span question whose spans are where a relation starts |
| **To (span variable)** | The span question whose spans are where it ends |

**From** and **To** can be the same span question: linking actors to other
actors. They can also differ: linking actors (from an `actors` question) to
the issues they talk about (from an `issues` question).

The editor lists the loop's questions under **From** and **To**; pick span
questions that come **before** the relation question. Anything else is
reported as an error, such as *Relation 'from' refers to 'tone' which is
not a preceding span variable*.

Relations have a direction: *A criticizes B* is not *B criticizes A*. Name
the options so that the direction is clear, and read them as
*from ... to*.

To offer only some spans as start or end, for example only spans labelled
*person* as the one who criticizes, add `values` to `from` or `to` in the
JSON view:

```json
"from": { "variable": "actors", "values": ["person"] },
"to": { "variable": "actors" }
```

## How coders link spans

When the relation question comes up, coders have already marked their
spans. They see three lists (side by side on a wide screen):

1. **Select from ...**: the span where the relation starts, shown with its
   text and value;
2. the kind of relation (the first option is chosen already);
3. **Select to ...**: the span where it ends.

Clicking **Link** adds the relation to the list under it; the cross next to
a relation removes it. Coders can add as many relations as they like, then
click **Done**, which counts them. **Skip** goes on without relations; it
is stored as skipped, not as *no relations*.

If coders notice that a span is missing, they can go back to the span
question, add it, and come forward again. The relations they made before
are still there, except those whose spans they deleted.

> Linking spans is demanding work. Pilot a relation question carefully,
> keep the number of relation types small, and give examples in the
> instruction.

## What is stored

Every relation is stored with:

- the **value** of its option (e.g. `criticizes`);
- the span it starts **from** and the span it goes **to**, by the span's
  id.

In the downloaded `annotations.csv`, a relation's column shows each
relation as `value: from → to`, with the texts of its two spans. Its `_json`
column has the ids of the spans, which match the `id`s in the span
question's `_json` column, so you can rebuild the network. See
[Downloading results](results.md).

## Using the answers

| Reference | Gives |
| --- | --- |
| `$var.links.values` | the values of all relations, e.g. `criticizes, supports` |
| `$var.links.labels` | their labels |

Conditions can ask whether a relation of a kind was made
(`$var.links.has("criticizes")`) and how many there are
(`$var.links.count()`). See [Conditions](conditions.md).
