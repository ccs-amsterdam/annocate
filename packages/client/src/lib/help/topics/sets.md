---
title: Set columns
section: Units and distribution
order: 2
summary: Set columns in your units - which coder or condition each unit is for, overlap, practice and gold units, and filling a column.
---

A **set column** says who or which group each unit is for: a `coder`
column with names, a `framing` column with `control` and `experiment`.
Each value is a **set**. The design uses them for:

- **Specific coders** (Coder unit assignments): each coder gets their value's
  units (see [Giving each coder their own units](own-units.md));
- a **Crowd's set column** (Coder unit assignments): its special units for
  every coder, and with other values a link per value, whose coders code
  that set;
- an **experiment linked to units**: each condition its units (see
  [Experimental conditions](experimental-conditions.md));
- a **loop's subset**: e.g. a pre-test and a post-test loop (see
  [Handing out units](unit-distribution.md)).

Without a set column every coder gets all units.

## A sets column in your CSV

Upload a column with the type **set**; each cell lists the unit's values:

| Cell        | Means                                                     |
| ----------- | --------------------------------------------------------- |
| `anna`      | for `anna`                                                |
| `anna;bob`  | for `anna` and `bob`                                      |
| `_overlap`  | for everyone                                              |
| `_practice` | a practice unit, for everyone (see [Overlap, gold and practice units](special-units.md)) |
| `_gold`     | a gold unit, for everyone                                 |
| `anna#3`    | for `anna`, as her third unit                             |
| _(empty)_   | for nobody (deploying warns)                              |

`_overlap`, `_practice` and `_gold` are special only in the coder unit
assignment's column; elsewhere they are ordinary values. Values can't
contain `;` or `#`. Uploading again replaces the column.

## Seeing set columns

On **Units**, each set column has a row with its values and counts; click
a value to see its units. The table shows each unit's cell.

## Fill a set column

**Fill a set column** divides units without a column in your file:

| Setting     | Does                                                       |
| ----------- | ---------------------------------------------------------- |
| **Names**   | values, one per line (names, emails), or a number (`s1`, `s2`, ...) |
| **Overlap** | units set aside as `_overlap` (percentage or number)       |
| **Column**  | the column's name                                          |

Units are shuffled and divided evenly: 1000 units, 4 names, 10% overlap
gives 100 `_overlap` and 225 each.

## Adding units later

New units with the column get their values. Without it, you choose per
column: leave them out, spread them over existing values, or make new
values.

## Changing values by hand

Tick units, then **Put in set**: choose a value and column → **Put in**.
While a value is shown, **Remove from** takes units out. These are drafts
until you deploy; units a coder already got stay theirs.

## Sets are lists, not rules

A set is a fixed list, not a rule such as _"all units from 2024"_: it
doesn't change when you upload more, so a running study stays the same
and results say exactly who got what (see
[A design describes a process](design-reproducible.md)).

## Deleting a column

The bin icon next to it. Units stay. A column the deployed or latest
design uses can't be deleted.
