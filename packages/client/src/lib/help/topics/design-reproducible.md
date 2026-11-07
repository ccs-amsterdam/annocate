---
title: A design describes a process
section: Design notes
order: 3
summary: Why a design never contains unit ids or coders, why sets are lists, and how to share a design so others can repeat your study.
---

An AnnoTinder design describes *how* a study runs: the questions, the
conditions, how units are shown, and the rules by which units are handed out.
It never says *which* units or *which* people. Those live next to it, in the
study: the units, their sets and the links.

This split is deliberate. A design that holds only the process can be
shared with a paper, reviewed, and run again by someone else, on their own
units and with their own coders.

## Three layers

| Layer | Holds | Shared with the study? |
| --- | --- | --- |
| **Design** | Questions, conditions, layouts, per loop the rules for handing out units, and the session parameters links carry. It refers to sets and groups by name, and to coders only through their answers and session values | Yes: this is the instrument |
| **Sets** | Named lists of units in groups, such as `s1`, `s2`, `_overlap` in a group `parts` | As data, if you may share the units |
| **Links** | Made from the design's link parameters, with who may use them: login, email addresses, participant ids, max uses | No: they are about your coders |

## The design names, but never binds

The design may *name* things that only get a meaning in the study:

- **A set**: *every coder codes the units of set `gold`*. Which units are
  in `gold` is decided by the set, not the design.
- **A set that depends on the coder**: *each coder gets one set of group
  `parts`*, drawn, or named by their link or login. See
  [Handing out units](unit-distribution.md).
- **A group of coders**: *coders in the experimental group get this layout*,
  where the group is an [auto question](auto.md) (drawn at random or
  balanced), or a [session parameter](session-parameters.md) from the link.

What the design never contains is a unit id, a participant id, an email
address or a link's address. So:

- the same design runs on another set of units with the same fields (the
  next year's news, another country's tweets);
- someone replicating your study runs your design with their own coders,
  without changing it;
- a shared design reveals nothing about who your coders were.

## Sets are lists, not rules

A set is a stored list of units, in order. It is not a rule like
"units 1 to 100" or "a random 10%". **Split units into sets** draws the sets
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

Which links exist follows from the design: deploying makes a link per
value of its link parameters (see [Links](links.md)). Everything
about specific people is set on the links themselves:

- who may use a link: a login, a list of email addresses;
- a fixed participant id, for a personal link;
- how many coders may start with it.

These settings stay on the server and are not part of the design. Two
studies with the same design can give their links to completely different
coders.

## Sharing a design

To give someone your design, open the codebook editor, switch to the
**JSON** view, and copy the whole text. They paste it into the **JSON** view
of a study of their own. Scripts can do the same through the
[researcher API](researcher-api.md).

For the design to run in another study, that study needs:

- **units with the fields the design uses**, with the same names
  (`$unit.headline` needs a `headline` field). The design declares them, so
  the Units page says what an upload must have;
- **set groups and sets with the names the design uses**, if it names
  any. Deploying then makes the links.

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

- **Random draws are not repeated.** An auto question drawn at random,
  and a random unit order, give a different draw in a new run. The
  procedure is the same; the outcome per coder is not. The data records what
  each coder got.
- **Assigning sets by link or login moves a decision out of the design.**
  The design then says only that each link (or email address) has its own
  set; who got which link is up to you. Document how you divided them.
- **Routing by an answer is a convenience, not a lock.** It decides which
  units an honest coder gets; it doesn't keep a determined coder from other
  groups' units. See [Privacy and where data lives](design-privacy.md).
