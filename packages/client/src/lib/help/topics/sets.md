---
title: Set columns
section: Units and distribution
order: 2
summary: Set columns in your units - which coder or condition each unit is for, overlap, practice and gold units, and filling a column.
---

A **set column** is a column of your units that says who or which group a
unit is for: a `coder` column with coder names, a `framing` column with
`control` and `experiment`, a `phase` column with `pre` and `post`. Each
value of the column is a **set**: the units whose cell holds it.

The design uses set columns by name:

- **Units divided over coders** (in **Session**): each coder gets the units
  of their value (see [Giving each coder their own units](own-units.md)).
- **A condition linked to units**: each session gets the units of its
  condition (see [Experimental conditions](experimental-conditions.md)).
- **A loop's filter**: only (or all except) units with certain values,
  such as a pre-test loop and a post-test loop (see
  [Handing out units](unit-distribution.md)).

You don't need a set column for a simple study: without one, every session
gets all units.

## A sets column in your CSV

The easiest way is a column in the file you upload, with the column type
**set**. Its name is the column's name in the design; each cell lists the
unit's values:

| Cell | Means |
| --- | --- |
| `anna` | for `anna` |
| `anna;bob` | for `anna` and for `bob` |
| `_overlap` | for everyone: every coder or condition codes it |
| `_practice` | a practice unit, for everyone (see [Overlap, gold and practice units](special-units.md)) |
| `_gold` | a gold unit, for everyone |
| `anna#3` | for `anna`, as her third unit (the order, for loops in set order) |
| *(empty)* | for nobody: deploying warns about such units |

Values can't contain `;` or `#`. Names starting with `_` are the special
ones above. A column's name is letters, digits and `_`, starting with a
letter. Uploading the file again replaces the column's values.

## Seeing set columns

On the **Units** tab, above the table, every set column has a row with its
values and how many units each has. Click a value to see its units, in
order. The table has a column per set column, showing each unit's cell.

## Fill a set column

To divide units without a column in your file, click **Fill a set column**:

| Setting | What it does |
| --- | --- |
| **Names** | The values to divide over, one per line: coder names or email addresses. Or a number, for `s1`, `s2`, ... |
| **Overlap** | Units set aside as `_overlap`, as a percentage or a number of units |
| **Column** | The column's name (new, or one to replace) |

The units are shuffled, the overlap is taken, and the rest is divided
evenly: with 1000 units, 4 names and 10% overlap, 100 units are
`_overlap` and each name gets 225. The shuffle is stored: filling again
gives a new division.

## Adding units later

Uploading new units with the column fills it in for them. Uploading new
units without it asks per set column what to do: leave them out, spread
them over the existing values (smallest first), or make new values of
about the same size.

## Changing units' values by hand

Tick units in the table, then under **Put in** choose a value and its
column and click **Put in**. A value or column that doesn't exist yet is
made. While a value is shown, **Remove from** takes the selected units out.

All of this is a draft: running coding picks it up when you deploy, and
units a coder already got stay theirs.

## Sets are lists, not rules

A set is a fixed list of units, not a rule such as *"all units from 2024"*.
It doesn't change when you upload more units, and its order stays the
same: a running study doesn't change because someone uploaded material,
and the results say exactly which units were for whom. The design names
the columns; which units are in them is your data (see
[A design describes a process](design-reproducible.md)).

## Deleting a column

Click the bin icon next to the column. Its units stay in the study. A
column can't be deleted while the deployed or latest design uses it.
