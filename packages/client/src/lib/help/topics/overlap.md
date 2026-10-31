---
title: Overlap: units every coder codes
section: Units and distribution
order: 6
summary: Overlap units that every coder codes besides their own set - for intercoder reliability and gold units.
---

An **overlap** is a set of units that every coder codes in full, besides
their own units. When coders divide the work (each their own set, or a
shared queue), the overlap gives you units that *all* of them coded, so you
can compare them: for intercoder reliability, or to check coders against
units with a known answer.

The overlap of a group is its set `_overlap` (see
[Sets and set groups](unitsets.md)). A loop that **assigns sets** of the
group, or a **crowd coding** queue over one of its sets, can add it.

## Setting it up

1. Make the overlap units. The easiest way is **Split units into sets** on
   the **Units** tab with an **overlap** of, say, 10%: it sets aside a random
   `_overlap` set and splits the rest into sets. Or give units the set
   `_overlap` in a sets column of your CSV.
2. In the unit loop, choose where the overlap units go, under **Overlap**:
   **Spread through them** by default (see below). With **Assign sets**
   choose **Disabled** for no overlap.
3. Optionally, **Recommended**: how many overlap units you want. Publishing
   warns when the group has fewer. **At most** limits how many a coder gets:
   **the first ones**, or **a random draw** (the same units for every coder,
   so they can be compared).

A unit in `_overlap` is not one of a coder's own units: it comes once, as
overlap. With the overlap **Disabled**, the `_overlap` set plays no part. The
loop's form warns when the overlap is on but the group has no `_overlap`
units.

## Placement

| Placed | What coders get |
| --- | --- |
| **Spread through them** (the default) | The overlap units evenly spread among their own units |
| **First** | First all overlap units, then their own |
| **Last** | First their own units, then the overlap units |

With **Spread through them**, a coder with 100 own units and 4 overlap units
gets an overlap unit after every 20 of their own units. If a coder runs out
of own units sooner, the overlap units that are left come at the end.

Spreading needs to know how many units a coder will get. In a shared queue
that is **Units per coder, at most**, so the option needs it (the menu says
*needs max units per coder* until it is set).

Coders don't see which units are overlap units. With a random
[order](unit-distribution.md#order), the overlap units are shuffled per
coder too.

### Which placement to choose

- **Spread through them** is the best practice, and the default: the
  overlap units are coded throughout the session, when coders are fresh and
  when they are tired, so they represent the whole coding. Coders can't tell
  which units are being compared, so they can't take extra care with them.
- **First** makes the overlap a calibration round: you can check the first
  codings of every coder early, and retrain coders before they do the bulk
  of the work. But it biases the reliability you report: at the start coders
  are fresh and careful, which tends to inflate it compared with the rest of
  the coding. Use it for training, not as the reliability estimate.
- **Last** measures coders when they are most
  experienced, but also most tired, and coders who stop early never reach
  the overlap.

## Intercoder reliability designs

A common design for a content analysis with student coders:

1. **Pilot**: two or three coders code the same 50 units (**Everyone codes everything**,
   with a `pilot` set). Compute reliability, discuss the disagreements, improve the
   codebook and the coder instructions. Repeat if needed.
2. **Main coding**: split the sample into a set per coder, plus an overlap
   of about 10% (and at least 50 to 100 units). **Assign sets**, with the
   overlap spread through them.
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
research team or experts. Put them in the `_overlap` set, and every coder
codes them. In the analysis, compare each coder's answers to the known answers to
see which coders are accurate, to exclude coders who clearly didn't do the
task (common in crowd coding), or to train coders before the real work.

AnnoTinder doesn't score gold units itself: you compare the answers with
your key after downloading the [results](results.md). For a check *during*
the session, such as an attention check that ends the session of
participants who fail it, use a question with a condition and an end item:
see [Ending a session](end-items.md).
