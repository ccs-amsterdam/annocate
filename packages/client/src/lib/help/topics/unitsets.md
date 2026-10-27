---
title: Unitsets
section: Units and distribution
order: 2
summary: Named lists of units - for handing out different units to different coders, overlap sets and parts.
---

A **unitset** is a named list of units, such as `pilot`, `part_1` or
`gold`. A unit loop in the codebook names the unitset its coders get, so
unitsets are how you give different coders different units: a pilot sample
first, a part per coder, a set that everyone codes for reliability.

You don't need unitsets for a simple study: a loop can use **all units** of
the job. You manage unitsets on the **Units** tab.

## Seeing unitsets

Above the table of units is a row of buttons: **All units**, and one per
unitset, each with its number of units. Click one to see its units, in the
set's order. The **Unitsets** column of the table shows which sets a unit is
in. A unit can be in any number of sets.

## Making a set from selected units

1. Tick the units you want (the box in the header selects all units on the
   page).
2. Click **New unitset from selection**.
3. Type a name.

This is handy for small, hand-picked sets: a pilot of ten units, or units
with a known answer for training coders. For larger sets, made from a
column of your data (say all articles from one newspaper), upload the units
in separate files and select them per file, or make the sets with a script
(see [Scripts and the researcher API](researcher-api.md)).

Choose names with letters, digits and `_`, without spaces, such as
`pilot_2` rather than `Pilot 2`: then a codebook can also build the name
from an answer (see [Different units for different coders](coder-groups.md)).

## Split into parts

To divide units over coders at random, click **Split units into parts**
(or, while a unitset is shown, **Split set into parts** to split that set):

| Setting | What it does |
| --- | --- |
| **parts** | How many parts to make |
| **overlap** | Units set aside for an overlap set that every coder codes, as a percentage or a number of **units** |
| **name prefix** | The start of the names: `part` makes `part_1`, `part_2`, ... and `part_overlap` |

The units are shuffled first, then the overlap set is taken, and the rest is
divided into parts that differ in size by at most one unit. The text under
the settings says exactly which sets will be made, and how big they are.
Click **Create … unitsets** to make them.

With 1000 units, 4 parts and 10% overlap you get `part_overlap` with 100
units and `part_1` to `part_4` with 225 units each. Then:

- in a unit loop, choose **One set per coder** and tick `part_1` to
  `part_4`, and turn on **Overlap** with the set `part_overlap` (see
  [Handing out units](unit-distribution.md) and
  [Overlap](overlap.md)); or
- give each coder's invitation its own part, and choose
  **The invitation's units** in the loop.

The shuffle uses a random seed, so splitting twice gives different parts.
That is fine: the sets are stored, and the split is not made again.

> To give named coders each their own part, with a personal invitation link,
> use **Divide units over coders…** on the **Invitations** tab instead. It
> splits the units the same way and makes the invitations in one go. See
> [Invitations](invitations.md).

## The all-units set

Wherever a unit loop asks for a unitset, leaving the field empty means **all
units** of the job (its placeholder says *All units*). The units then come
in the order they were uploaded. In the codebook's JSON this is written as
`__all__`.

Unlike your own unitsets, *all units* grows when you upload more units,
also while coding runs: coders get the new units without a new codebook
version.

## Sets are lists, not rules

A unitset is a fixed list of units, not a rule such as *"all units from
2024"* or *"a random 10%"*. Once made, it doesn't change when you upload more
units, and its order stays the same.

That is on purpose. A running study should not change because someone
uploaded more material: coders who were given `part_2` keep coding exactly
`part_2`, and when you report the study, the sets say exactly which units
were coded by whom. It also keeps the codebook shareable: the codebook names
the sets (`part_1`, `gold`), but which units are in them is your data, not
part of the codebook. See
[A codebook describes a process](design-reproducible-codebooks.md).

The order of a set is the order coders get its units in, unless the loop
uses random order (see [Order](unit-distribution.md#order)).

> Make your unitsets before coders reach the loop that uses them, and check
> them in the preview. A coder routed to a set that doesn't exist gets an
> error instead of units. A set you make after publishing is used right
> away: you don't need to publish the codebook again.

## Deleting a set

Show the set and click **Delete set**. Its units stay in the job. A set can't
be deleted while a version of the codebook refers to it, or while an
invitation hands it out: coders may be working on it.
