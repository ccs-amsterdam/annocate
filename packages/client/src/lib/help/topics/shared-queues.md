---
title: Shared queues: coding until enough coders agree
section: Units and distribution
order: 4
summary: Crowd coding (units shared among coders) - how many codings a unit needs, agreement rules, limits per coder, priority and what it means for analysis.
---

With **crowd coding**, coders draw from one queue. Each unit is handed out
until it is **done**: a number of coders coded it, or agreed on it. You
don't need to know how many coders will come; those who do more code more.

**Coder invitations** → **Crowd** → tick **Share the units among coders**.
The rules apply in every unit loop. Each loop's queue holds its units (per
condition, if conditions are linked to units, see
[Handing out units](unit-distribution.md)).

## The settings

|                             | at least                                                  | at most                                 |
| --------------------------- | --------------------------------------------------------- | --------------------------------------- |
| **Units per coder**         | every coder gets this many (see [below](#a-minimum-per-coder)) | a coder never gets more            |
| **Coders per unit**         | a unit is done after this many coders                     | extra codings allowed up to this        |
| _or_ **Agreement per unit** | done once this many agree on the chosen question          | never more coders than this             |

## When a unit is done

- **Coders per unit**: `1` is the cheapest; `2` or `3` give majority votes
  or reliability.
- **Agreement per unit**, on a loop question with one categorical answer
  (categories, ordered options, swipe): done once _at least_ coders gave
  the same answer. Skipped answers don't count. In loops without that
  question, a unit is done after that many coders.

_"Until 2 coders agree on `sentiment`, at most 5"_ gives easy units 2
codings and hard ones up to 5. Only coders who **finished** a unit count.

## Limits

**At most coders per unit** is required with an agreement rule. **At most
units per coder** is worth setting: it limits fatigue, fixes the task size
for panel payment, lets coders see their progress (_unit 12 of 40_), and is
needed to spread [overlap](overlap.md).

Sample size: 1000 units × 3 coders / 50 units per coder = at least 60
coders who finish. Recruit a few more.

### Near the end of the queue

When no unit needs more coders, a coder still gets a unit that isn't
**full** (at _at most_, or agreed on), the least-coded first. Only when
every unit is full do they get nothing.

### A minimum per coder

A late coder could get few units or none. **At least units per coder**
lets such a coder exceed _at most coders per unit_ (with an agreement
rule, never on agreed units), least-coded first. It costs extra codings:
set it only as high as needed (e.g. a panel paying for 20 units).

## Priority

- **Cover all units first** (default): every unit gets a first coding
  before any gets a second. Stopping early leaves codings spread over the
  sample.
- **Finish units first**: units are completed one by one. Stopping early
  leaves part complete and the rest empty.

Within a priority, the loop's [order](unit-distribution.md#order) applies.

## Units being coded right now

A unit handed out is **reserved** for that coder for 15 minutes (a browser
loads up to five ahead), so the last needed coding doesn't go to five
coders at once. A reload gets the same units; a coder who leaves frees
them after 15 minutes. A unit occasionally gets one coding more than
needed. The time is `leaseSeconds` in `session.invite.share` in the JSON
view (default `900`).

## What this means for analysis

- **Units have different coders**: use a reliability measure that allows
  this, such as Krippendorff's alpha.
- **Different numbers of codings** with an agreement rule; more codings
  means harder to agree.
- **Agreement rules inflate reliability**: coding stops when coders agree.
  Compute reliability on an [overlap](overlap.md) set every coder codes.
- **Majority labels**: the most frequent answer.
- **Coders differ in how much they coded**: check per coder (`coder`
  column of the [results](results.md)).

> Follow progress per loop on the **Overview** tab.
