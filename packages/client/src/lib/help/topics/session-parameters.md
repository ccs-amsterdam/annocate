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

| Setting           | What it is                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Name**          | the name in the design: `$session.<name>`                                                          |
| **In the URL as** | the key in the link, e.g. `STUDY_ID` (default: the name)                                           |
| **Values**        | **Any value** (up to 256 characters), **From a list**, or **Matching a pattern** (e.g. `[0-9]{6}`) |
| **Default**       | used when the link has none; without one it is required                                            |
| **Description**   | a note for you and colleagues                                                                      |

Four keys can't be used **In the URL as** (or as the name, when that is
the key): `link`, `transfer` and `login`, which are part of every study
link, and `source`, which every link accepts already (see
[Built-in values](#built-in-values)). The editor says so, e.g. _"'login'
is part of every study link (link, transfer, login): use another key"_.
The same goes for the URL parameter of a
[coder id](links.md#coder-ids).

## Required parameters

Without a default, a link without the parameter (or with a value that
doesn't fit) doesn't start. Copied links end in placeholders
(`?wave=<wave>`): fill them in, or let a panel do so.

## A link per value

For a list of values, **Links** can show **A link per value of a
URL parameter**, e.g. one per school. These are the same links with the
value filled in.

## Built-in values

| Value             | What it is                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `$session.source` | the `?source=` of any link: where a coder came from; never required |
| `$session.coder`  | the coder id (see [Links](links.md#coder-ids))                      |

## Public title

The **title shown to coders**, at the top of the item tree, is the study's
name for coders (their list of studies, the menu, the browser tab). The
study's own name stays private. Without one: "Untitled study".

## Experiments

A value typed into a link isn't random: draw conditions with an
[experiment](experimental-conditions.md). An experiment can still take its
condition from a URL parameter with a list of values (**Assigned: From a
URL parameter**), e.g. when a panel assigns the groups. A URL parameter
can also steer the design directly, e.g. a `language` in a branch's
condition.
