---
title: A codebook describes a process
section: Design notes
order: 3
summary: Why a codebook never contains unit ids or coders, why unitsets are lists, and how to share a codebook so others can repeat your study.
---

An AnnoTinder codebook describes *how* a study runs: the questions, the
conditions, how units are shown, and the rules by which units are handed out.
It never says *which* units or *which* people. Those live next to it, in the
job: the units, the unitsets and the invitations.

This split is deliberate. A codebook that holds only the process can be
published with a paper, reviewed, and run again by someone else, on their own
units and with their own coders.

## Three layers

| Layer | Holds | Shared with the study? |
| --- | --- | --- |
| **Codebook** | Questions, conditions, layouts, and per loop the rules for handing out units. It refers to unitsets by name, and to coders only through their answers and assigned groups | Yes: this is the instrument |
| **Unitsets** | Named lists of unit ids, such as `part_1`, `part_2`, `gold` | As data, if you may share the units |
| **Invitations** | Links, with who may use them, preset values and the units for that link | No: they are about your coders |

## The codebook names, but never binds

The codebook may *name* things that only get a meaning in the job:

- **A unitset**: *every coder codes the units of `gold`*. Which units are in
  `gold` is decided by the unitset, not the codebook.
- **A unitset that depends on the coder**: `part_$var.slot.value` gives a
  coder with slot 2 the set `part_2`. See
  [Different units for different coders](coder-groups.md).
- **A group of coders**: *coders in the experimental group get this layout*,
  where the group is an [assigned variable](auto.md): drawn at random, or set
  by the coder's invitation.

What the codebook never contains is a unit id, a participant id, an email
address or an invitation. So:

- the same codebook runs on another set of units with the same fields (the
  next year's news, another country's tweets);
- someone replicating your study runs your codebook with their own coders,
  without changing it;
- a published codebook reveals nothing about who your coders were.

## Unitsets are lists, not rules

A unitset is a stored list of unit ids, in order. It is not a rule like
"units 1 to 100" or "a random 10%". **Split into parts** draws the sets for
you, then stores the result as lists.

That has two consequences:

- **Uploading more units never changes an existing set.** Coders who were
  given `part_2` keep getting the same units. (Loops that use *all* units,
  with the unitset field left empty, do include new units.)
- **The list is the record.** You can report exactly which units were in
  the reliability set, and someone else can use the same list.

The trade-off: a set doesn't update itself. If you add units and want them
coded, make a new set or use all units.

## Invitations hold who gets what

Everything about specific people lives in [invitations](invitations.md):

- a personal link per coder, with preset values (for example `slot=2`, so the
  codebook routes that coder to `part_2`);
- a participant id, for linking answers to a panel's records;
- the units of that link, for loops that hand out **Assign sets by invitation link**
  (what **Divide units over coders** sets up).

Invitations stay on the server and are not part of the codebook. Two studies
with the same codebook can invite coders completely differently.

## Sharing a codebook

To give someone your codebook, open the codebook editor, switch to the
**JSON** view, and copy the whole text. They paste it into the **JSON** view
of a job of their own. Scripts can do the same through the
[researcher API](researcher-api.md).

For the codebook to run in another job, that job needs:

- **units with the fields the codebook uses**, with the same names
  (`$unit.headline` needs a `headline` field). The editor warns about fields
  the job doesn't have;
- **unitsets with the names the codebook uses**, if it names any;
- **invitations** that set the values the codebook expects, if it routes
  coders by a value set by invitation.

[Scripts](scripts.md) in conditions and templates are plain JavaScript
expressions, so they can be read and checked without AnnoTinder.

## What to archive with a study

For your replication materials:

1. **The codebook** as JSON: the version(s) coders used. Each published
   version stays in the version history, with its note.
2. **The download**: `variables.csv` lists every codebook version's
   questions, options and labels; `units.csv` the units as coders saw them;
   `annotations.csv` the answers, with the codebook version and unit version
   of each row. See [Downloading results](results.md).
3. **The unitsets** that mattered (reliability set, gold units, parts), as
   lists of unit ids.
4. **The coder instructions** you gave outside AnnoTinder, and how coders
   were trained.

## Limits

- **Random draws are not repeated.** An assigned variable drawn at random,
  and a random unit order, give a different draw in a new run. The
  procedure is the same; the outcome per coder is not. The data records what
  each coder got.
- **"Assign sets by invitation link" moves a decision out of the codebook.** The
  codebook then says only that each invitation has its own units; who got
  which is in your invitations. Document how you divided them.
- **Routing by an answer is a convenience, not a lock.** It decides which
  units an honest coder gets; it doesn't keep a determined coder from other
  groups' units. See [Privacy and where data lives](design-privacy.md).
