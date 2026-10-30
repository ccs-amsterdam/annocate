---
title: Different units for different coders
section: Units and distribution
order: 5
summary: Coder groups in a unit loop - routing coders to units by their answers, assigned variables or session values.
---

Sometimes different coders should get different units. In a survey
experiment, the treatment group reads other messages than the control
group. In a coding project, Dutch-speaking coders get the Dutch articles.

There are two ways to do this in a unit loop:

- **Assign sets**: each coder gets a set of a group, drawn or named by their
  link, participant id or login (see
  [Handing out units](unit-distribution.md)). No conditions needed.
- **Coder groups**: the loop has several groups, each with a condition and
  its own units.

Coder groups work on **coder-level questions** and session values: questions
outside unit loops, asked (or assigned) before the loop, such as an
[assigned variable](auto.md) for an experimental condition, and
`$session` values from the link (see [Session parameters](session-parameters.md)).

## Coder groups

On the loop's **Units** tab, click **Different units for different coder
groups…**. The loop then shows a list of groups under **Coder groups**:

- **If**: the first group, with a condition;
- **Else if**: more groups with conditions (add them with **+ Group**);
- **Otherwise**: the group for coders who match none of the conditions.

Each group has its own **Who codes which units**, set, settings and
overlap, exactly like a loop without groups (see
[Handing out units](unit-distribution.md)). The conditions are written like
any other condition, with **Rules** or a **Script** (see
[Conditions](conditions.md)), and can only use coder-level questions from
before the loop and `$session` values.

The groups are checked from top to bottom, and **the first group whose
condition holds** decides the coder's units. Remove a group with its bin
icon; with one group left, the loop is back to a single setting without a
condition.

Without an **Otherwise** group, coders who match none of the conditions get
no units in this loop: they skip it. Use **+ Otherwise** to add it again.

### Example: an experiment

The units have a sets column `condition` with the sets `treatment` and
`control` (see [Sets and set groups](unitsets.md)). The codebook starts with
an assigned variable `group`, with the options `treatment` and `control` and
the source **Balanced (option with fewest coders)** (so both groups get
about as many participants). The unit loop has two groups:

| Group | Condition | Units |
| --- | --- | --- |
| If | `group` is `treatment` | **Everyone codes everything**, set `treatment` of `condition` |
| Otherwise | | **Everyone codes everything**, set `control` of `condition` |

Every participant rates all messages of their group, and the results show
each participant's group in the `group` column of `coders.csv`. The setup
wizard's **Experimental groups** makes exactly this.

When *you* decide the condition per link instead (two panel studies, or a
link per class), make `condition` a link parameter of the Session item and
use `$session.condition.is("treatment")` in the conditions, or, simpler,
**Assign sets** named by the link.

## Routing is sticky

The first time a coder reaches a loop, AnnoTinder decides their group and
set, and remembers them. After that:

- a coder who goes back and changes an answer that a condition uses keeps
  the units they got;
- editing a condition, reordering the groups, or changing the loop's label
  moves nobody;
- changing *which units* a group hands out (its mode, set or group, or
  where an assigned set comes from) and publishing that routes its coders again the next time they ask for a
  unit. The units they finished stay finished.

This keeps coders from switching between groups halfway, which would spoil
an experiment.

> Routing is a convenience, not access control. The coder's own browser
> works out which group they are in, so a determined coder could ask for the
> units of another group. Assigned variables themselves can't be changed by
> coders, and **Assign sets** is decided by the server. For an experiment
> that is rarely a problem; just don't rely on routing to keep material
> secret.
