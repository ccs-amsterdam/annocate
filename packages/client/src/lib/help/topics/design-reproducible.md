---
title: A design describes a process
section: Design notes
order: 3
summary: Why a design never contains unit ids or coders, why sets are lists, and how to share a design so others can repeat your study.
---

An AnnoTinder design describes _how_ a study runs: the questions, the
conditions, how units are shown, and the rules by which units are handed out.
It never says _which_ units or _which_ people. Those live next to it, in the
study: the units, their sets and the links.

This split is deliberate. A design that holds only the process can be
shared with a paper, reviewed, and run again by someone else, on their own
units and with their own coders.

## Three layers

| Layer           | Holds                                                                                                                                                                                                               | Shared with the study?              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Design**      | Questions, conditions, layouts, per loop the rules for handing out units, the coder invitations and the URL parameters links carry. It refers to sets and groups by name, and to coders only through their answers and session values | Yes: this is the instrument         |
| **Set columns** | Which coder or condition each unit is for, such as `anna`, `anna;bob`, `_overlap` in a column `coder`                                                                                                               | As data, if you may share the units |
| **Links**       | Made from the design's coder invitations (one link, or one per coder), with labels, participant ids and max uses                                                                                                    | No: they are about your coders      |

## The design names, but never binds

The design may _name_ things that only get a meaning in the study:

- **A set**: _every coder codes the units of set `gold`_. Which units are
  in `gold` is decided by the set, not the design.
- **Units that depend on the coder or condition**: _the coders are the
  values of the column `coders`_, or _the random condition `framing` is
  linked to the column `framing`_. See [Handing out units](unit-distribution.md).
- **A group of coders**: _coders in the experimental group get this layout_,
  where the group is a [random condition](experimental-conditions.md).

What the design never contains is a unit id, a participant id, an email
address or a link's address. So:

- the same design runs on another set of units with the same fields (the
  next year's news, another country's tweets);
- someone replicating your study runs your design with their own coders,
  without changing it;
- a shared design reveals nothing about who your coders were.

## Sets are lists, not rules

A set is a stored list of units, in order. It is not a rule like
"units 1 to 100" or "a random 10%". **Fill a set column** draws the sets
for you, then stores the result as lists.

That has two consequences:

- **Uploading more units never changes an existing set.** Coders who were
  given `s2` keep getting the same units. (Loops that use **All units** do
  include new units, once you deploy them.)
- **The list is the record.** You can report exactly which units were in
  the reliability set, and someone else can use the same list.

The trade-off: a set doesn't update itself. If you add units and want them
coded, make a new set or use all units.

## Links hold who may take part

Which links exist follows from the design: deploying makes one link, or
with specific coders a link per coder (see [Links](links.md)). Everything
about specific people is outside the design, in the coders' column and on
the links themselves:

- who the coders are: the values of the coders' column (names or email
  addresses);
- a fixed participant id, for a personal link;
- how many coders may start with it.

These settings stay on the server and are not part of the design. Two
studies with the same design can give their links to completely different
coders.

## Sharing a design

To give someone your design, open the design editor, switch to the
**JSON** view, and copy the whole text. They paste it into the **JSON** view
of a study of their own. Scripts can do the same through the
[researcher API](researcher-api.md).

For the design to run in another study, that study needs:

- **units with the fields the design uses**, with the same names
  (`$unit.headline` needs a `headline` field). The design declares them, so
  the Units page says what an upload must have;
- **set columns with the names the design uses**, if it names any: the
  coders' column with their own coders, and the condition values it lists. Deploying checks this, and makes the
  links.

[Scripts](scripts.md) in conditions and templates are plain JavaScript
expressions, so they can be read and checked without AnnoTinder.

## What to archive with a study

For your replication materials:

1. **The design** as JSON: the design version(s) coders used. Each deployed
   version stays in the version history, with its note.
2. **The download**: `variables.csv` lists every design version's
   questions, options and labels; `units.csv` the units as coders saw them;
   `annotations.csv` the answers, with the design version and unit version
   of each row. See [Downloading results](results.md).
3. **The sets** that mattered (reliability set, gold units, parts), as
   lists of unit ids.
4. **The coder instructions** you gave outside AnnoTinder, and how coders
   were trained.

## Limits

- **Random draws are not repeated.** A random condition drawn at random,
  and a random unit order, give a different draw in a new run. The
  procedure is the same; the outcome per coder is not. The data records what
  each coder got.
- **Specific coders move a decision out of the design.** The design then
  says only that each coder has their own units; who the coders are, and
  which units each got, is in the coders' column. Document how you divided
  them.
- **Routing by an answer is a convenience, not a lock.** It decides which
  units an honest coder gets; it doesn't keep a determined coder from other
  groups' units. See [Privacy and where data lives](design-privacy.md).
