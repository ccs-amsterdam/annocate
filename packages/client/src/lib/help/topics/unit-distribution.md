---
title: Handing out units
section: Units and distribution
order: 3
summary: Which units each coder gets - the four modes, when to use each, and the order of units.
---

Every unit loop says which units its coders get. Does every coder code
everything, or do coders share the work? Does each coder get their own
part? You set this on the loop's **Units** tab in the codebook editor, under
**Who codes which units**.

The codebook describes *how* units are handed out, never *which* units go to
*whom* by id: it refers to [unitsets](unitsets.md) by name, and to coders
only through their answers or invitations. That keeps a codebook shareable
and the design easy to report.

## The four modes

| Mode | Who gets what | Typical use |
| --- | --- | --- |
| **All units** | Every coder codes every unit of a unitset | Small samples, reliability tests, survey experiments |
| **Units shared among coders** | One queue for all coders: each unit until enough coders coded it | Large samples, crowd coding |
| **One set per coder** | Each coder gets one of several unitsets | Dividing a sample into fixed parts |
| **The invitation's units** | Each coder gets the unitset of their invitation link | Named coders, each with their own part |

### All units

Every coder codes every unit of the **Unitset** you name. Leave the field
empty for all units of the job; type or pick a name for a unitset (the field
suggests the job's sets).

Use it when every unit should be coded by every coder: a reliability test
with three coders, a pilot, or a survey experiment in which each participant
rates the same ten messages. It is also the mode for routing coders
yourself, with a unitset name that depends on an answer (see
[Different units for different coders](coder-groups.md)).

### Units shared among coders

The units of the unitset form a queue that all coders draw from. Each unit
is handed out until it is done, either when a number of coders coded it, or
when a number of coders agree on a question, and then to no one else. Coders
keep getting units until the queue is empty, or until they reach the
*at most* of **Units per coder**.

Use it for large samples that need, say, one or two codings per unit, and
for crowd coding, where you don't know in advance how many coders will come
or how much each will do. The settings are explained in
[Shared queues](shared-queues.md).

### One set per coder

Each coder gets one of the unitsets you tick under **Sets**. A new coder gets
the set with the fewest coders so far (the first of those, when there is a
tie). **All starting with…** ticks every set whose name starts with what you
type, such as `part_`.

A coder counts for their set once they finished it, and while they are
active: when they started it, or finished a unit of it, in the last 24 hours.
A coder who stops halfway and doesn't come back stops counting after a day,
so their set is handed out again. When every set has a coder, the next coder
gets a second copy of a set, and so on: with more coders than sets, every
set gets coded more than once.

Use it with sets made by **Split units into parts** (see
[Unitsets](unitsets.md)): for example 4 parts of 225 articles for 4 student
assistants, without having to say who gets which part.

> **All starting with…** ticks every set with that start, except one ending
> in `_overlap` (such as `part_overlap`): that one belongs under **Overlap**,
> not among the coders' sets.

### The invitation's units

Each coder gets the unitset of the invitation link they came in with. You
set it per invitation, under **Units** on the **Invitations** tab, or let
**Divide units over coders…** make a set and a personal link per coder. See
[Invitations](invitations.md).

Use it when you know your coders: *Alice codes these 200 articles, Bob those*.
Who gets what is stored with the invitations, not in the codebook. A coder
whose invitation has no units gets no units in this loop; the
**Invitations** tab warns about such links. A preview uses the units of the
first invitation that has some.

## Choosing a mode

- **Everyone codes the same units?** All units.
- **Each unit coded by a fixed number of coders, with coders coming and
  going?** Units shared among coders.
- **Fixed parts, handed out in turn?** One set per coder.
- **Fixed parts for named people?** The invitation's units.

The difference between the last two: with **One set per coder** AnnoTinder
decides who gets which part, and fills the parts in turn; with
**The invitation's units** you decide, through the links you send.

Any mode can add an **overlap**: a set that every coder codes besides their
own units, for intercoder reliability. See [Overlap](overlap.md).

## Order

Under **Order** you choose in which order a coder gets their units:

| Order | What coders get |
| --- | --- |
| **In unitset order** | The units in the order of the unitset (for all units: the order they were uploaded). Every coder gets the same order. |
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
- **In unitset order** is right when the order matters: units that tell a
  story, a thread of messages, a training set that goes from easy to hard,
  or when you want every coder to see exactly the same sequence. You set the
  order by the order of the unitset.

In a shared queue, the queue's priority comes first (units that need
codings), and the order decides among units that are equally far. With
**In unitset order**, coders then work through the queue in the same order,
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
> with your real units and unitsets, but stores nothing, and it doesn't use
> up units of a shared queue.
