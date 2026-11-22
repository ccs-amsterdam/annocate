---
title: Overlap: units every coder codes
section: Units and distribution
order: 6
summary: Overlap units that every coder codes besides their own set - for intercoder reliability and gold units.
---

An **overlap** is a set of units every coder codes, besides their own:
when coders divide the work, it gives units all of them coded, for
intercoder reliability. It is the value `_overlap` in the set column of
the **Coder unit assignments** (the coders' column, or a crowd's set
column; see [Sets](sets.md)). For only some coders, write `anna;bob`.

## Setting it up

1. Mark the overlap: **Create new coder distribution…** (specific coders)
   or **Create special units…** (a crowd) in **Coder unit assignments**
   (or **Fill a set column** on **Units**) with an overlap of e.g. 10%,
   or write `_overlap` in your CSV.
2. On the loop's **Units** tab, the **Overlap units** row shows the count;
   choose where they go.

## Placement

| Placed                          | Coders get                               |
| ------------------------------- | ---------------------------------------- |
| **Spread throughout** (default) | overlap units evenly among their own     |
| **Before coding units**         | overlap first                            |
| **After coding units**          | overlap last                             |
| **Leave out**                   | none in this loop                        |

Spread: 100 own units and 4 overlap gives one after every 20. In a
[shared queue](shared-queues.md) (a divided crowd) without a maximum of units per coder,
they come at random (about one in ten, at most twenty apart). Coders can't
tell which units are overlap. Gold and practice units are placed the same
way.

- **Spread** (best practice): coded fresh and tired alike, and coders
  can't take extra care with them.
- **Before**: a calibration round to retrain coders early, but it
  inflates reliability. Use it for training, not as the estimate.
- **After**: coders who stop early never reach it.

## Intercoder reliability designs

1. **Pilot**: two or three coders code the same 50 units; compute
   reliability, discuss disagreements, improve the codebook. Repeat.
2. **Main coding**: divide the sample, plus about 10% overlap (at least
   50-100 units), spread through (see
   [Giving each coder their own units](own-units.md)).
3. **Report** reliability on the overlap, e.g. Krippendorff's alpha.

Rare categories need a larger overlap: at 2% prevalence, 100 units hold
about two. In a shared queue with an agreement rule, the overlap is the
honest place to measure reliability.

## Gold units

Units with a known answer: mark them `_gold`; answers are checked and
coders who fail can be stopped. See
[Overlap, gold and practice units](special-units.md).
