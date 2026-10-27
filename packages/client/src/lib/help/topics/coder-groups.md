---
title: Different units for different coders
section: Units and distribution
order: 5
summary: Coder groups in a unit loop - routing coders to units by their answers, assigned variables or invitations.
---

Sometimes different coders should get different units. In a survey
experiment, the treatment group reads other messages than the control
group. In a coding project, Dutch-speaking coders get the Dutch articles.
Or each coder gets a part of the sample chosen by a number on their
invitation link.

There are two ways to do this in a unit loop, and they combine:

- **Coder groups**: the loop has several groups, each with a condition and
  its own units.
- **A unitset name with an answer in it**, such as `part_$var.slot.value`:
  one group, whose unitset depends on the coder.

Both work on **coder-level questions**: questions outside unit loops, asked
(or assigned) before the loop. That includes
[assigned variables](auto.md), which coders never see: a random or balanced
group, a value preset on the invitation, or a URL parameter.

## Coder groups

On the loop's **Units** tab, click **Different units for different coder
groups…**. The loop then shows a list of groups under **Coder groups**:

- **If**: the first group, with a condition;
- **Else if**: more groups with conditions (add them with **+ Group**);
- **Otherwise**: the group for coders who match none of the conditions.

Each group has its own **Who codes which units**, unitset, settings and
overlap, exactly like a loop without groups (see
[Handing out units](unit-distribution.md)). The conditions are written like
any other condition, with **Rules** or a **Script** (see
[Conditions](conditions.md)), and can only use coder-level questions from
before the loop.

The groups are checked from top to bottom, and **the first group whose
condition holds** decides the coder's units. Remove a group with its bin
icon; with one group left, the loop is back to a single setting without a
condition.

Without an **Otherwise** group, coders who match none of the conditions get
no units in this loop: they skip it. Use **+ Otherwise** to add it again.

### Example: an experiment

The codebook starts with an assigned variable `group`, with the options
`treatment` and `control` and the source **Balanced (option with fewest coders)** (so both groups get
about as many participants). The unit loop has two groups:

| Group | Condition | Units |
| --- | --- | --- |
| If | `group` is `treatment` | **All units** of `messages_treatment` |
| Otherwise | | **All units** of `messages_control` |

Every participant rates all messages of their group, and the results show
each participant's group in the `group` column of `coders.csv`.

## A unitset name with an answer in it

A unitset name can contain a reference to a coder-level question, which is
filled in with the coder's answer:

```text
part_$var.slot.value
```

A coder whose `slot` is `2` gets the unitset `part_2`; a coder whose
`language` is `nl` gets, with `articles_$var.language.value`, the set
`articles_nl`. You type the name in the **Unitset** field, in **All units**
or **Units shared among coders** mode, and in the overlap's unitset.

This saves you a group per set. Some rules:

- the question must have one answer (not several), and the coder must have
  answered it. A coder without an answer gets an error instead of units, so
  use a question that every coder answers, or an assigned variable;
- every name it can produce must be an existing unitset. With
  **Split units into parts** and the prefix `part`, the options of `slot`
  are then `1`, `2`, `3`, ...;
- use `.value`, the stored value of the answer, rather than the label: values
  are short and stable. See [Referring to answers and unit data](references.md).

**One set per coder** doesn't take references in its sets: it chooses among
fixed names itself.

## Combining with assigned variables and invitations

Assigned variables are the usual way to route coders, because coders never
see or change them:

| Source | Routing |
| --- | --- |
| **Random draw** | A random group per coder, with weights if you like |
| **Balanced (option with fewest coders)** | The group with the fewest coders so far: equal groups |
| **Set by invitation** | The value preset on the coder's invitation link, e.g. `slot=2` |
| **URL parameter** | A value in the link, e.g. from a panel company |

For example, to give named coders each their own part: an assigned variable
`slot` with **Set by invitation**, the unitset name `part_$var.slot.value`,
and per coder an invitation with the preset `slot=1`, `slot=2`, and so on.
(The mode **The invitation's units** does the same without a variable: see
[Invitations](invitations.md).)

To spread coders evenly over parts *without* naming them, you don't need a
variable at all: use **One set per coder**.

## Routing is sticky

The first time a coder reaches a loop, AnnoTinder decides their group and
unitsets, and remembers them. After that:

- a coder who goes back and changes an answer that a condition uses keeps
  the units they got;
- editing a condition, reordering the groups, or renaming the loop moves
  nobody;
- changing *which units* a group hands out (its mode, unitset or overlap)
  and publishing that routes its coders again the next time they ask for a
  unit. The units they finished stay finished.

This keeps coders from switching between groups halfway, which would spoil
an experiment.

> Routing is a convenience, not access control. The coder's own browser
> works out which group they are in, so a determined coder could ask for the
> units of another group. Assigned variables themselves can't be changed by
> coders, and **One set per coder** and **The invitation's units** are
> decided by the server. For an experiment that is rarely a problem; just
> don't rely on routing to keep material secret.
