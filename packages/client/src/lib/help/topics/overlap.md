---
title: Overlap: units every coder codes
section: Units and distribution
order: 6
summary: An overlap set that every coder codes besides their own units - for intercoder reliability and gold units.
---

An **overlap** is a unitset that every coder codes in full, besides their
own units. When coders divide the work (each their own part, or a shared
queue), the overlap gives you units that *all* of them coded, so you can
compare them: for intercoder reliability, or to check coders against units
with a known answer.

You turn it on per loop (or per coder group) on the loop's **Units** tab:
tick **Overlap: a set every coder codes too**.

## Setting it up

1. Make the overlap set. The easiest way is **Split units into parts** on
   the **Units** tab with an **overlap** of, say, 10%: it sets aside a random
   `part_overlap` set and splits the rest into parts. See
   [Unitsets](unitsets.md).
2. In the unit loop, tick **Overlap: a set every coder codes too**, and type
   the set's name under **Unitset** (it starts as `overlap`).
3. Choose where the overlap units go, under **Placed**.

The overlap set should not also be part of the coders' own units: a unit in
both is coded only once per coder. Sets made by **Split units into parts**
and **Divide units over coders…** keep them apart.

The overlap works with every mode. It is most useful with **One set per
coder**, **The invitation's units** and **Units shared among coders**; with
**All units** every coder already codes the same units.

## Placement

| Placed | What coders get |
| --- | --- |
| **Before the coder's units** | First all overlap units, then their own (the default) |
| **After the coder's units** | First their own units, then the overlap units |
| **Spread through them** | The overlap units evenly spread among their own units |

With **Spread through them**, a coder with 100 own units and 4 overlap units
gets an overlap unit after every 20 of their own units. If a coder runs out
of own units sooner, the overlap units that are left come at the end.

Spreading needs to know how many units a coder will get. In a shared queue
that is **Max units per coder**, so the option needs it (the menu says
*needs max units per coder* until it is set).

Coders don't see which units are overlap units. With a random
[order](unit-distribution.md#order), the overlap units are shuffled per
coder too.

### Which placement to choose

- **Spread through them** is usually the best choice for reliability: the
  overlap units are coded throughout the session, when coders are fresh and
  when they are tired, so they represent the whole coding. Coders can't tell
  which units are being compared, so they can't take extra care with them.
- **Before the coder's units** makes the overlap a calibration round: you can
  check the first codings of every coder early, and retrain coders before
  they do the bulk of the work. But reliability measured at the start, while
  coders are still learning, may be lower (or, if they are extra careful at
  the start, higher) than later on.
- **After the coder's units** measures coders when they are most
  experienced, but also most tired, and coders who stop early never reach
  the overlap.

## Intercoder reliability designs

A common design for a content analysis with student coders:

1. **Pilot**: two or three coders code the same 50 units (**All units** of a
   `pilot` set). Compute reliability, discuss the disagreements, improve the
   codebook and the coder instructions. Repeat if needed.
2. **Main coding**: split the sample into a part per coder, plus an overlap
   of about 10% (and at least 50 to 100 units). Every coder codes their part
   and the overlap, spread through it.
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
research team or experts. Put them in the overlap set, and every coder codes
them. In the analysis, compare each coder's answers to the known answers to
see which coders are accurate, to exclude coders who clearly didn't do the
task (common in crowd coding), or to train coders before the real work.

AnnoTinder doesn't score gold units itself: you compare the answers with
your key after downloading the [results](results.md). For a check *during*
the session, such as an attention check that ends the session of
participants who fail it, use a question with a condition and an end item:
see [Ending a session](end-items.md).
