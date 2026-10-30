---
title: Session parameters
section: Coders
order: 2
summary: Values a session starts with - from its link or URL - as $session values, a link per value, and the participant id.
---

A **session parameter** is a value a coder's session starts with, taken
from the link they open. The codebook can use it anywhere as
`$session.<name>`: in conditions, in texts, in an end item's return link,
and to give coders a set of units. You declare them in the codebook's
**Session** item: add it in the codebook tree (**+** at the top level,
**Session**). It is always the codebook's first item.

There are two kinds:

| Kind | Where the value comes from | Example |
| --- | --- | --- |
| **Link parameter** | Fixed in the link: publishing makes a link per value (and per combination) | a link per set, per condition, per class |
| **URL parameter** | Added to a link by whoever shares it: `?wave=2` | a panel's study id, a wave number |

The values are stored with the session when it starts, so coders can come
back without them, and they appear in the results (`coders.csv`).

## Values

A parameter's values are one of:

- **From a list**: the values you type, one per line;
- **The sets of a group**: the names of a group's sets (see
  [Sets and set groups](unitsets.md)), so a loop can give coders the set
  their link names. New sets get their link without publishing again;
- **Any value** (URL parameters only): any value up to 256 characters,
  optionally matching a **pattern** (a regular expression).

A URL parameter has a **URL key** (the name in the link, e.g. `STUDY_ID`;
by default the parameter's name) and a **Default**. Without a default it is
required: a link without it, or with a value that doesn't fit, doesn't
start.

## A link per value

Every value of a link parameter gets its own link on the Invitations tab,
labelled with the value. With two link parameters, every combination gets a
link: `condition` (a, b) and `class` (1, 2, 3) make six links. Tick **Only
some combinations** to list the combinations you need. See
[Links](invitations.md).

Use link parameters when *you* decide who gets which value: a link per
class, a link per expert coder's set, or an experiment in which you send
each condition's link to other people. When the value should be drawn
(random or balanced), use an [assigned variable](auto.md) instead.

## Built-in values

| Value | What it is |
| --- | --- |
| `$session.participant` | The participant id (see below, and [Links](invitations.md#participant-ids)) |
| `$session.source` | The `?source=` of any link, if given: where a coder came from (a newsletter, a QR code). Never required |
| `$session.email` | The email the coder logged in with, if any |

These names can't be used for your own parameters.

## Participant id from the URL

Tick **Participant id from a URL parameter** and name the parameter, such as
`PROLIFIC_PID`. Every link then needs it, and the id is
`$session.participant`. An optional pattern checks its format. See
[Online panels and crowd coding](online-panels.md).

## Giving coders a set

A unit loop with **Assign sets** can take a coder's set from a session
value: a link or URL parameter with the sets of the loop's group, the
participant id, or the login email. See
[Handing out units](unit-distribution.md).
