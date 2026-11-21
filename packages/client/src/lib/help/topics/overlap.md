---
title: Overlap: units every coder codes
section: Units and distribution
order: 6
summary: Overlap units that every coder codes besides their own set - for intercoder reliability and gold units.
---

An **overlap** is a set of units that every coder codes in full, besides
their own units. When coders divide the work (each their own units, or a
shared queue), the overlap gives you units that _all_ of them coded, so you
can compare them: for intercoder reliability, or to check coders against
units with a known answer.

The overlap is the value `_overlap` in a [set column](sets.md): the
column the design divides units over (its coders, or a random condition
linked to units). To have only _some_ coders code a unit, write their values
together instead: `anna;bob`.

## Setting it up

1. Mark the overlap units. The easiest way is **Make the column…** in the
   **Coder invitations** (or **Fill a set column** on the **Units** tab)
   with an **overlap** of, say, 10%: it sets aside a random `_overlap` part
   and divides the rest. Or write `_overlap` in the column of your CSV.
2. In the unit loop's **Units** tab, the **Overlap units** row shows how
   many there are. Choose where they go: **Spread through them** (the
   default, see below), **Before them**, **After them**, or **Leave out**
   for no overlap in this loop.

An overlap unit comes once per coder, as overlap. Left out, the `_overlap`
units play no part in the loop.

## Placement

| Placed                                | What coders get                                       |
| ------------------------------------- | ----------------------------------------------------- |
| **Spread through them** (the default) | The overlap units evenly spread among their own units |
| **Before them**                       | First all overlap units, then their own               |
| **After them**                        | First their own units, then the overlap units         |
| **Leave out**                         | No overlap units in this loop                         |

With **Spread through them**, a coder with 100 own units and 4 overlap units
gets an overlap unit after every 20 of their own units. If a coder runs out
of own units sooner, the overlap units that are left come at the end.

Spreading evenly needs to know how many units a coder will get. In a
[shared queue](shared-queues.md) without **Units per coder, at most**,
AnnoTinder doesn't know, so overlap units come at random instead: after
each of their own units, a coder gets an overlap unit with a chance of
about one in ten, never more than twenty apart. The order is random per
coder, so coders can't tell which units are compared, and a reload gives
the same order. Overlap units left when a coder's own units run out come at
the end. Gold and practice units are placed the same way
([Overlap, gold and practice units](special-units.md)).

Coders don't see which units are overlap units. With a random
[order](unit-distribution.md#order), the overlap units are shuffled per
coder too.

### Which placement to choose

- **Spread through them** is the best practice, and the default: the
  overlap units are coded throughout the session, when coders are fresh and
  when they are tired, so they represent the whole coding. Coders can't tell
  which units are being compared, so they can't take extra care with them.
- **Before them** makes the overlap a calibration round: you can check the first
  codings of every coder early, and retrain coders before they do the bulk
  of the work. But it biases the reliability you report: at the start coders
  are fresh and careful, which tends to inflate it compared with the rest of
  the coding. Use it for training, not as the reliability estimate.
- **After them** measures coders when they are most
  experienced, but also most tired, and coders who stop early never reach
  the overlap.

## Intercoder reliability designs

A common design for a content analysis with student coders:

1. **Pilot**: two or three coders code the same 50 units (a loop with only
   the `pilot` value of a `phase` column, everyone coding all units). Compute reliability, discuss the disagreements, improve the
   codebook and the coder instructions. Repeat if needed.
2. **Main coding**: divide the sample over the coders, plus an overlap of
   about 10% (and at least 50 to 100 units), with the overlap spread through
   their units (see [Giving each coder their own units](own-units.md)).
3. **Report** the reliability on the overlap units, such as Krippendorff's
   alpha, which compares all coders on the same units.

How big should the overlap be? Large enough for a precise estimate,
especially for categories that are rare: if only 2% of articles are about
the environment, 100 overlap units contain about two of them, too few to say
anything about that category. Some researchers then draw the overlap from
the units most likely to contain the rare categories, and report that.

In a [shared queue](shared-queues.md) with an agreement rule, the overlap is
the honest place to measure reliability: the queue itself stops as soon as
coders agree, which hides disagreement.

## Gold units

**Gold units** are units with a known answer, for example coded by the
research team. Mark them `_gold` instead of `_overlap`: every coder codes
them, AnnoTinder checks the answers, and coders who get too many wrong can
be stopped. See [Overlap, gold and practice units](special-units.md).
