---
title: Coder, condition and part sets
section: Units and distribution
order: 2
summary: The units' columns with a role - who codes each unit (coder_set), each condition's units (condition_set), parts of the study (part_set) and test units (test_set).
---

Four columns of your units have a fixed name and meaning. Any other column
is data (text to show, metadata).

| Column          | Label         | Says                                                   | Used by                                   |
| --------------- | ------------- | ------------------------------------------------------ | ----------------------------------------- |
| `coder_set`     | Coder set     | who codes the unit: `anna`, `anna;bob`, an email address | **Expert coders** (see [Giving each coder their own units](own-units.md)) |
| `condition_set` | Condition set | the experiment's conditions the unit is for            | an [experiment](experimental-conditions.md) that gives each condition its own units |
| `part_set`      | Part set      | the part of the study, e.g. `pre`, `post`              | a unit loop shows one part (see [Handing out units](unit-distribution.md)) |
| `test_set`      | Test set      | `overlap`, `practice` or `gold` (empty: a coding unit) | where loops put test units, and their checks (see [Overlap, gold and practice units](special-units.md)) |

Without them every coder gets all units. Each value of a `*_set` column is
a **set**: the units with that value.

## Role columns in your CSV

Name a column like the role and it is that column (see
[Uploading units](uploading-units.md)). Each cell lists the unit's values:

| Cell       | Means                                  |
| ---------- | -------------------------------------- |
| `anna`     | for `anna`                             |
| `anna;bob` | for `anna` and `bob`                   |
| `anna#3`   | for `anna`, as her third unit          |
| _(empty)_  | in no set                              |

`test_set` takes one of `overlap`, `practice` or `gold` per unit. Values
can't contain `;` or `#`. Uploading a role column again replaces it.

## Seeing them

On **Units**, each role column has a row with its label, values and
counts; click a value to see its units. The table shows each unit's cell.

## Making them in AnnoTinder

**Create special set…** on **Units** makes any of them:

- **Coder set**: divides the units over your coders (also **Create coder
  set…** in **Who codes**, Expert coders; see
  [Giving each coder their own units](own-units.md)).
- **Part set** or **condition set**: a number of values (`part1`,
  `part2`, ...) or names, one per line (`pre`, `post`). Units are shuffled
  and divided evenly (also **Make a part set…** in a loop's form, **Make a
  condition set…** in an experiment's).
- **Test set**: a number of overlap, practice and gold units, drawn at
  random (practice units in the order drawn). The coder set dialog can
  draw them too (**Redistribute test units**), or put selected units in
  `overlap`, `practice` or `gold` of `test_set` on **Units**.

If the column exists, making it again overwrites it, after asking. For a
coder, part or condition set you can instead **Assign units without a
value, keep the rest**: units with no value that aren't test units get
one (a coder set gives them to its coders, those with the fewest units
first, with the coders per unit you give; a part or condition set spreads
them evenly over its values, at random). Every current value stays.

## Adding units later

New units with the column get their values. Without it, you choose per
column: leave them out, spread them over existing values, or make new
values. Test units stay as they are.

Coders with their own link keep it: once you deploy the units, they pick up
their new units on their next visit, and are told how many (the message is
set when you deploy). A finished session opens again for them, unless it has
closed (**When coders finish** in the study's **Settings**).

## Moving units between coders

**Coders…** in the coder set's row opens the coders: per coder the units
they coded and how many they still have to code, and how many units no
coder has (**unassigned**). Units a coder coded always stay theirs.

- Change a coder's **To code**: type a number, or **0**, **−10**, **+10**
  or **+n** (all unassigned units). Fewer makes units they haven't coded
  unassigned (the ones never sent to them first: a unit they were sent may
  be on their screen); more gives them unassigned units.
- The hand icon gives all of a coder's uncoded units to the others, those
  with the fewest left first. A coder who coded nothing leaves the coder set
  (their link stops working).
- Rename a coder who hasn't started (a started coder's name is how their
  work is kept), or **Add coder**. **All coders are email addresses** shows
  whether coders can sign in instead of each getting a link.

Nothing changes until **Confirm unit assignments**; like every change to
sets, it is a draft until you deploy the units. When you divide units again
with the coder set dialog, **Keep the units coders already coded** does the
same: coded units stay, the rest is divided anew.

## Changing values by hand

Tick units, then **Put in set**: a value and the column → **Put in**.
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
