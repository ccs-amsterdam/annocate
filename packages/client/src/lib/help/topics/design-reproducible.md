---
title: A design describes a process
section: Design notes
order: 3
summary: Why a design never contains unit ids or coders, why sets are lists, and how to share a design so others can repeat your study.
---

A design describes _how_ a study runs (questions, conditions, layouts, the
rules for handing out units), never _which_ units or people. So it can be
shared with a paper, reviewed, and run again by others on their own units
and coders.

## Three layers

| Layer           | Holds                                                                                 | Shared?                          |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| **Design**      | questions, conditions, layouts, distribution rules, coder unit assignments, URL parameters | yes: the instrument              |
| **Set columns** | which coder or condition each unit is for                                             | as data, if you may share units  |
| **Links**       | made from the invitations, with labels, fixed coder ids, max uses                     | no: about your coders            |

## The design names, but never binds

The design may name a set (`gold`), a coders' column (`coders`), or a
condition linked to a column (`framing`), but never contains a unit id,
coder id, email address or link. So the same design runs on next year's
news, a replication runs it with other coders, and a shared design reveals
nothing about your coders.

## Sets are lists, not rules

A set is a stored list of units, not a rule (**Fill a set column** draws
it once and stores the result). Uploading more units never changes it, and
the list is the record of who got what. Loops over **All units** do
include new units once deployed.

## Links hold who may take part

Who the coders are (the coders' column), fixed coder ids and max uses stay
on the server, outside the design (see [Links](links.md)).

## Sharing a design

Copy the whole **JSON** view of the editor (or use **Export**) and paste it
into another study's JSON view, or use the
[researcher API](researcher-api.md). The other study needs units with the
fields the design uses (the Units page lists them) and set columns with
the names it uses; deploying checks this.

## What to archive with a study

1. **The design** versions coders used (each with its note).
2. **The download**: `variables.csv`, `units.csv`, `annotations.csv`,
   `designs/v<n>.json` (see [Downloading results](results.md)).
3. **The sets** that mattered, as lists of unit ids.
4. **Coder instructions and training** given outside AnnoTinder.

## Limits

- **Random draws differ** in a new run (conditions, unit order); the data
  records what each coder got.
- **Specific coders** move who codes what into the coders' column:
  document how you divided units.
- **Routing is a convenience, not a lock**: see
  [Privacy and where data lives](design-privacy.md).
