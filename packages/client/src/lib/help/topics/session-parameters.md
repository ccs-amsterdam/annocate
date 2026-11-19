---
title: The session: coders, conditions and parameters
section: Coders
order: 2
summary: What a session starts with - its coder, its assigned conditions and link or URL parameters - and the links deploying makes for them.
---

In the editor, **Session** (above the item tree) holds what a coder's
session starts with. The design uses each of them as `$session.<name>`.
You don't make links yourself: deploying makes them from these settings,
listed under **Deploy › Links**.

| Setting | What it is | Links |
| --- | --- | --- |
| **Coders** | Units divided over coders, by a set column | a link per coder, or one sign-in link for email addresses |
| **Assigned conditions** | Values such as `control` and `experiment` | a link per value, or one link that draws |
| **Link parameters** | Other values fixed per link, such as a class | a link per value |
| **URL parameters** | Values added to a link by whoever shares it | none |

The values are stored with the session when it starts, so coders can come
back without them, and they appear in the results (`coders.csv`).

## Coders

Tick **Units are divided over coders** and choose the set column with the
coders. Each session then gets the units of its coder, and
`$session.coder` is the coder's value. Names give a link per coder; email
addresses give one link at which coders sign in. See
[Giving each coder their own units](own-units.md).

## Assigned conditions

A condition with values such as `control` and `experiment`, assigned by
link or drawn when the session starts (balanced or at random), and
optionally linked to units. See
[Experimental conditions](experimental-conditions.md).

## Public title

At the top of the item tree, in place: the **title shown to coders**, what coders see as
the study's name, on their list of studies and in the coding screen's
menu and browser tab. The study's own name stays private, so it can say what
the study is about. Without one, coders see "Untitled study".

## Values

A parameter's values are one of:

- **From a list**: the values you type, one per line;
- **Any value** (URL parameters only): any value up to 256 characters,
  optionally matching a **pattern** (a regular expression).

A URL parameter has a **URL key** (the name in the link, e.g. `STUDY_ID`;
by default the parameter's name) and a **Default**. Without a default it is
required: a link without it, or with a value that doesn't fit, doesn't
start.

## A link per value

Every value of a link parameter gets its own link under Deploy › Links,
labelled with the value. With two link parameters, every combination gets a
link: `condition` (a, b) and `class` (1, 2, 3) make six links. Tick **Only
some combinations** to list the combinations you need. See
[Links](links.md).

Every coder and every value of a condition assigned by link multiply the
links in the same way. For conditions, use **Assigned conditions** rather
than a link parameter: they can be drawn and linked to units.

## Built-in values

| Value | What it is |
| --- | --- |
| `$session.participant` | The participant id (see below, and [Links](links.md#participant-ids)) |
| `$session.source` | The `?source=` of any link, if given: where a coder came from (a newsletter, a QR code). Never required |
| `$session.email` | The email the coder signed in with, if any |
| `$session.coder` | The coder, when units are divided over coders |

These names can't be used for your own parameters.

## Participant id from the URL

Tick **Participant id from a URL parameter** and name the parameter, such as
`PROLIFIC_PID`. Every link then needs it, and the id is
`$session.participant`. An optional pattern checks its format. See
[Online panels and crowd coding](online-panels.md).

## Signing in

Whether coders sign in is a setting of the study, not of the design: off,
optional or required, chosen when you first deploy and changeable in the
study's settings. Coders who are email addresses always sign in. See
[Links](links.md#login).
