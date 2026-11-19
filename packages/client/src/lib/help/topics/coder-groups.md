---
title: Coder groups in a loop
section: Units and distribution
order: 5
summary: Different loop settings for different coders - a filter or crowd coding per group, by their answers or session values.
---

Usually you don't need coder groups. Which units a coder gets is decided
by the design's **Session**: units divided over coders, or a condition
linked to units (see [Giving each coder their own units](own-units.md) and
[Experimental conditions](experimental-conditions.md)).

Coder groups are for the rest: a loop that should work differently for
some coders. For example, coders who said they read Dutch code only the
Dutch articles (a filter on a `language` column), or coders in the
`experiment` condition code the units as a shared queue while the others
code them all.

## Setting up groups

On the loop's **Units** tab, click **Different units for different coder
groups…**. The loop then has a list under **Coder groups**:

- **If**: the first group, with a condition;
- **Else if**: more groups with conditions (add them with **+ Group**);
- **Otherwise**: the group for coders who match none of the conditions.

Each group has its own filter, crowd coding settings and special units,
exactly like a loop without groups (see
[Handing out units](unit-distribution.md)). The conditions are written like
any other, with **Rules** or a **Script** (see [Show if](conditions.md)),
and can use coder-level questions from before the loop and `$session`
values, such as `$session.framing`.

The groups are checked from top to bottom, and the first group whose
condition holds decides. Without an **Otherwise** group, coders who match
none of the conditions skip the loop.

### Example

A `language` set column marks each article `nl` or `en`. Before the loop,
the question `reads_dutch` (yes/no). The loop has two groups:

| Group | Condition | Units |
| --- | --- | --- |
| If | `reads_dutch` is `yes` | all the session's units |
| Otherwise | | only those with `en` in `language` |

## Routing is sticky

The first time a coder reaches a loop, AnnoTinder decides their group and
remembers it. After that:

- a coder who goes back and changes an answer that a condition uses keeps
  the units they got;
- editing a condition, reordering the groups, or changing the loop's label
  moves nobody;
- changing a group's filter or crowd coding settings and deploying that
  routes its coders again the next time they ask for a unit. The units they
  finished stay finished.

This keeps coders from switching between groups halfway, which would spoil
an experiment.

> Routing is a convenience, not access control. The coder's own browser
> works out which group they are in, so a determined coder could ask for the
> units of another group. The session's own units (by coder or condition)
> are decided by the server.
