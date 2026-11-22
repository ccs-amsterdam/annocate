---
title: URL parameters
section: Coders
order: 2
summary: Values a link carries in its URL - a distribution channel, a wave, a panel's ids - available in the design as $session values.
---

A **URL parameter** is a value added to a study's link: `?wave=2`,
`?school=north`, or ids a panel fills in. The design uses it as
`$session.<name>` in conditions, texts and return links. Values are stored
when the session starts (coders can come back without them) and are in
`coders.csv` as `session.<name>`.

## Adding a parameter

Click **URL parameters** above the item tree → **+ URL parameter**:

| Setting           | What it is                                                     |
| ----------------- | -------------------------------------------------------------- |
| **Name**          | the name in the design: `$session.<name>`                      |
| **In the URL as** | the key in the link, e.g. `STUDY_ID` (default: the name)        |
| **Values**        | **Any value** (up to 256 characters), **From a list**, or **Matching a pattern** (e.g. `[0-9]{6}`) |
| **Default**       | used when the link has none; without one it is required        |
| **Description**   | a note for you and colleagues                                  |

## Required parameters

Without a default, a link without the parameter (or with a value that
doesn't fit) doesn't start. Copied links end in placeholders
(`?wave=<wave>`): fill them in, or let a panel do so.

## A link per value

For a list of values, **Deploy › Links** can show **A link per value of a
URL parameter**, e.g. one per school. These are the same links with the
value filled in.

## Built-in values

| Value             | What it is                                                         |
| ----------------- | ------------------------------------------------------------------ |
| `$session.source` | the `?source=` of any link: where a coder came from; never required |
| `$session.coder`  | the coder id (see [Links](links.md#coder-ids))                     |
| `$session.group`  | a crowd link's set, with a link per set (see [Links](links.md))    |

## Public title

The **title shown to coders**, at the top of the item tree, is the study's
name for coders (their list of studies, the menu, the browser tab). The
study's own name stays private. Without one: "Untitled study".

## Experiments

A value typed into a link isn't random: draw conditions with a
[random condition](experimental-conditions.md). A URL parameter can still
steer the design, e.g. a `language` in Show if rules.
