---
title: Unit loops
section: Unit layouts
order: 1
summary: Questions that are asked once for every unit - how a loop works, and where you set its layout and units.
---

A **unit loop** repeats its questions for every unit a coder gets. The coder
sees the first unit with its first question, answers the loop's questions
about it, and then gets the next unit, until their units are done. Every
codebook that codes material has at least one loop: the questions about
news articles, tweets or images go inside it.

Questions *outside* a loop are asked once per coder: a consent question, a
few survey questions, an experimental group. Together the two make up most
studies: some questions about the coder, then a loop over the units.

## Adding a loop

In the codebook editor, click **+** in the tree and choose **Unit Loop**. A
new loop is empty: add its questions with **+**, choosing a place inside the
loop, or move existing questions into it. A loop needs at least one item.

A loop has no name, but you can give it a **Label (optional)**, such as
*News items* or *Training*. The label is shown in the tree, in the coders'
navigation menu and in the `loop` column of the downloaded `variables.csv`.
Without a label, the loop is called *Unit loop* (in messages and downloads
*Unit loop 1*, *Unit loop 2*, by position).

## The Layout and Units tabs

A selected loop has two tabs. The two small buttons at the end of the loop's
row in the tree open the loop on one of them.

| Tab | What you set there |
| --- | --- |
| **Layout** | How a unit is shown: the **Template**, the **Colours** and the **Snippets** |
| **Units** | Which units coders get: **Who codes which units**, the **Units** (all, or a set), the **Order**, the **Overlap**, and groups of coders that get different units |

The template is where you write what coders see of each unit: see
[Layout templates](layout-templates.md). The Units tab is explained in
[Handing out units](unit-distribution.md).

## Questions inside a loop

A question inside the loop is answered once for every unit. In the download
(`annotations.csv`) there is a row per unit and coder, with a column per
question. Inside a loop, texts and conditions can use more than outside:

- the unit's data: a question can say *"Is **$unit.headline** about
  politics?"*, and a condition can show a question only for some units
  (`$unit.source == "Twitter"`);
- the answers to the loop's earlier questions for the same unit, for
  follow-up questions (*"Which party?"* only if the coder said a party is
  mentioned);
- the answers to coder-level questions asked before the loop.

Some answer types only make sense per unit, and only work inside a loop:
[selecting text](span.md) and [relations](relation.md). The
[assigned variables](auto.md) (`auto`) work the other way round: only
outside a loop.

The loop's answers belong to the loop. After the loop, or in another loop,
you can't refer to them: AnnoTinder says *"'topic' is a question of another
unit loop"*. A loop can't be inside another loop, but it can be inside a
condition, for a loop that only some coders get.

## Questions before the loop

Coder-level questions before the loop are answered once, and the loop can use
their answers everywhere: in the layout, in its questions' texts and in its
conditions. Typical uses:

- an experimental group (an [assigned variable](auto.md)) that decides which
  version of a unit coders see, with `::: if` in the layout (see
  [Showing parts conditionally](template-blocks.md));
- the coder's experience, to show extra instructions to beginners;
- a choice that decides which units a coder gets (see
  [Different units for different coders](coder-groups.md)).

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
answers:
  role: student | journalist | -
---
::: if $var.role.answered
*You code as a $var.role.label.*
:::

# $unit.headline

$unit.text
```

Here `role` is a question before the loop: switch the answer to see what
coders with another answer see.

## Several loops

A codebook can have more than one loop, each with its own layout, units and
questions. Use this when a study has parts that work differently:

- a **training** loop with a few practice units, followed by the **main**
  loop;
- two tasks on different material, such as first headlines and then full
  articles;
- a loop over units, then survey questions, then a second loop.

Coders go through the loops in the order of the codebook. Each loop's
answers are kept apart; coder-level answers can be used in every loop after
them.

## What coders see

On the coding screen, the unit is shown at the top and the question on
screen at the bottom. On a phone, coders scroll the unit and answer with
their thumb. With a [swipe question](swipe.md), the unit itself is the card
that coders swipe.

Coders can go back to earlier questions and units with the arrows at the
top. The menu button next to them opens the navigation: the questions before
the loop, the loop (by its label) with *Unit 3 / 20*, and the loop's
questions. The number next to the arrows shows where they are: *2.1* is the
first question of the second part of the codebook. See
[What coders see](coder-experience.md).

## Order of units

By default coders get the units in the order of the set (for all units: the order they were uploaded). On the Units tab, **Order** can be set to
**Random (each coder their own order)**, so that order effects average out
over coders. See [Order](unit-distribution.md#order).

> Pilot a new loop with a few units in **Preview** before you invite coders:
> you see the layout and the questions exactly as coders do.
