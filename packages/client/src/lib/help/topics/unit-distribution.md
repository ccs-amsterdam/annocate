---
title: Handing out units
section: Units and distribution
order: 3
summary: Which units each coder gets - the three modes, when to use each, and the order of units.
---

Every unit loop says which units its coders get. Does every coder code
everything, or do coders share the work? Does each coder get their own
part? You set this on the loop's **Units** tab in the codebook editor, under
**Who codes which units**.

The codebook describes *how* units are handed out, never *which* units go to
*whom* by id: it refers to [sets and set groups](unitsets.md) by name, and
to coders only through their answers or session values. That keeps a
codebook shareable and the design easy to report.

## The three modes

| Mode | Who gets what | Typical use |
| --- | --- | --- |
| **Everyone codes everything** | Every coder codes every unit (of the job, or of one set) | Small samples, reliability tests, survey experiments |
| **Crowd coding** | One queue for all coders: each unit until enough coders coded it | Large samples, crowd coding |
| **Assign sets** | Each coder gets one set of a group | Dividing a sample into fixed parts, a part per named coder |

### Everyone codes everything

Every coder codes every unit under **Units**: **All units** of the job, or
one set of a group.

Use it when every unit should be coded by every coder: a reliability test
with three coders, a pilot, or a survey experiment in which each participant
rates the same ten messages. With [coder groups](coder-groups.md), each
group can code its own set: the treatment group one set of messages, the
control group another.

### Crowd coding

The units (all, or one set) form a queue that all coders draw from. Each
unit is handed out until it is done, either when a number of coders coded
it, or when a number of coders agree on a question, and then to no one else.
Coders keep getting units until the queue is empty, or until they reach the
*at most* of **Units per coder**.

Use it for large samples that need, say, one or two codings per unit, and
for crowd coding, where you don't know in advance how many coders will come
or how much each will do. The settings are explained in
[Shared queues](shared-queues.md). With a set, the queue can add its group's
[overlap](overlap.md) units for every coder.

### Assign sets

Each coder gets one set of a **Group**: for example the group `parts` with
the sets `s1` to `s4` made by **Split units into sets** (see
[Sets and set groups](unitsets.md)). Under **A coder's set is** you choose
how:

| Choice | A coder gets |
| --- | --- |
| **Drawn: the set with the fewest coders** | The set with the fewest coders so far (the first of those on a tie) |
| **Drawn at random** | A set at random |
| **Named by the link or URL** | The set a [session parameter](session-parameters.md) with the group's sets names: e.g. a link per set |
| **The coder's participant id** | The set named after their participant id |
| **The coder's login email** | The set named after their email: only those emails can code |

With **the fewest coders**, a coder counts for their set once they finished
it, and while they are active: when they started it, or finished a unit of
it, in the last 24 hours. A coder who stops halfway and doesn't come back
stops counting after a day, so their set is handed out again. With more
coders than sets, every set gets coded more than once.

To give each set its own link, so *you* decide who gets which set (a few
expert coders, each their own part), add a **link parameter** with the
group's sets to the codebook's Session item, and choose **Named by the link
or URL**: publishing makes a link per set, and a new set gets its link right
away. A coder whose value names no set gets no units in this loop.

With the **login email**, the group's set names are email addresses (say a
sets column in your CSV with `alice@uni.nl`, `bob@uni.nl`): only these
people can code, each their own set, logged in on any device. Others are
told their email address has no access to the study.

**Assign sets** also asks for the **Overlap**: the group's `_overlap` units
every coder codes besides their set, first, last or spread through their
units (the default), or **Disabled**. See [Overlap](overlap.md).

## Choosing a mode

- **Everyone codes the same units?** Everyone codes everything.
- **Each unit coded by a fixed number of coders, with coders coming and
  going?** Crowd coding.
- **Fixed parts, handed out in turn?** Assign sets, drawn.
- **Fixed parts for people you know?** Assign sets, named by the link (or
  by the login email).

## Order

Under **Order** you choose in which order a coder gets their units:

| Order | What coders get |
| --- | --- |
| **In set order** | The units in the order of the set (for all units: the order they were uploaded). Every coder gets the same order. |
| **Random (each coder their own order)** | Every coder gets the units in their own random order. |

A random order is fixed per coder: after a reload, or the next day, they
continue in the same order. The overlap units are shuffled in the same way.

Which to choose:

- **Random** is the safer choice for most content analyses. Coders get
  tired, and they learn as they go: in a fixed order the same units always
  come first (when coders are fresh) and last (when they are tired), which
  can bias the results. In a random order, these order effects average out
  over units. In a survey experiment, random order is how you counterbalance
  the order of the stimuli.
- **In set order** is right when the order matters: units that tell a
  story, a thread of messages, a training set that goes from easy to hard,
  or when you want every coder to see exactly the same sequence. You set the
  order by the order of the set (`s1#1`, `s1#2`, ... in a sets column).

In a shared queue, the queue's priority comes first (units that need
codings), and the order decides among units that are equally far. With
**In set order**, coders then work through the queue in the same order,
side by side; with **Random**, they spread over it.

## Coders in different groups

A loop can hand out different units to different groups of coders: for
example the treatment group of an experiment gets other messages than the
control group. Click **Different units for different coder groups…** at the
bottom of the **Units** tab. Each group then has its own mode and settings.
See [Different units for different coders](coder-groups.md).

## What coders see when they run out

A coder who has no units left in a loop simply continues with whatever comes
after the loop in the codebook, such as closing questions or a thank-you
message. That also happens when a coder gets no units at all, for instance
when no group matches them.

> Check the distribution in the preview before you publish: a preview codes
> with your real units and sets, but stores nothing, and it doesn't use
> up units of a shared queue.
