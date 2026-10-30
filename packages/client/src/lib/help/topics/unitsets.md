---
title: Sets and set groups
section: Units and distribution
order: 2
summary: Sets of units in groups - for giving different coders different units, overlap units, and a link per set.
---

A **set** is a named list of units, such as `s1`, `pilot` or
`alice@uni.nl`. Sets come in **groups**: a group is one way of dividing
your units, like a column in a spreadsheet. A group `parts` might have the
sets `s1` to `s4`; a group `language` the sets `nl` and `en`. A unit can be
in any number of sets, and in sets of different groups.

A unit loop names the set or group its coders get units from, so sets are
how you give different coders different units: a part per coder, a set per
experimental condition, a set per named coder.

You don't need sets for a simple study: a loop can use **all units** of the
job. You manage sets on the **Units** tab.

## Seeing sets

Above the table of units is **All units**, and a row per group with a button
per set and its number of units. Click a set to see its units, in the set's
order. The table has a column per group, showing each unit's sets in it,
just like a sets column in a CSV (below).

## A sets column in your CSV

The easiest way to make a group is a column in the file you upload. When you
upload units, give the column the type **Sets**: its name becomes the
group's name, and each cell names the unit's sets:

| Cell | Means |
| --- | --- |
| `s1` | the unit is in set `s1` |
| `s1;s2` | in `s1` and in `s2` |
| `s1#3` | in `s1`, as its third unit (the set's order) |
| *(empty)* | in no set of this group |

Set names can't contain `;` or `#`. Names starting with `_` are reserved:
`_overlap` is the group's [overlap](overlap.md), units every coder of the
group codes besides their own set. Uploading the file again replaces the
group's sets.

A group's name is letters, digits and `_`, starting with a letter.

## Split into sets

To divide units over coders at random, click **Split units into sets** (or,
while a set is shown, **Split set into sets** to split that set):

| Setting | What it does |
| --- | --- |
| **sets** | How many sets to make (`s1`, `s2`, ...) |
| **overlap** | Units set aside as `_overlap`, as a percentage or a number of **units** |
| **group name** | The new group's name |

The units are shuffled first, then the overlap is taken, and the rest is
divided into sets that differ in size by at most one unit. The text under
the settings says exactly which sets will be made. With 1000 units, 4 sets
and 10% overlap you get `_overlap` with 100 units and `s1` to `s4` with 225
units each. Then, in a unit loop, choose **Assign sets** with this group
(see [Handing out units](unit-distribution.md)).

The shuffle uses a random seed, so splitting twice gives different sets.
That is fine: the sets are stored, and the split is not made again.

## Putting selected units in a set

1. Tick the units you want (the box in the header selects all units on the
   page).
2. Under **Put in set**, type the set's name and its group, and click **Put
   in**. A set or group that doesn't exist yet is made.

While a set is shown, **Remove from** *set* takes the selected units out of
it. Coding that runs picks up changed sets at once; units a coder already
got stay theirs.

## Sets and links

A codebook can give each set of a group its own link, by a **link
parameter** with the group's sets in the codebook's Session item (see
[Session parameters](session-parameters.md)). A loop that assigns sets
"named by the link" then gives coders of each link that link's set. A new
set gets its link at once; a removed set's link is retired.

A group can also hold email addresses as set names: a loop that assigns sets
by the coder's **login email** then lets only those people code, each their
own set.

## Sets are lists, not rules

A set is a fixed list of units, not a rule such as *"all units from 2024"*.
Once made, it doesn't change when you upload more units, and its order stays
the same. A running study should not change because someone uploaded more
material, and when you report the study, the sets say exactly which units
were coded by whom. The codebook names groups and sets, but which units are
in them is your data, not part of the codebook (see
[A codebook describes a process](design-reproducible-codebooks.md)).

*All units*, on the other hand, grows when you upload more units, also while
coding runs.

## Deleting a group

Click the bin icon next to the group. Its units stay in the job. A group
can't be deleted while the published or latest codebook uses it.
