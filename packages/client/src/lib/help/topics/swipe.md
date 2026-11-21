---
title: Swipe
section: Question types
order: 5
summary: Answer by swiping the unit left, right or up - fast judgements with two or three options.
---

A **Swipe** question is answered by swiping, as in a dating app. In a unit
loop coders swipe the unit itself away with their answer: the fastest way
to code many units, and where AnnoTinder got its name. Like
[categories](nominal-and-ordinal.md) with one answer: each option has a
value and a label.

## Options and directions

Two or three options; their order is the direction:

| Position       | Direction   |
| -------------- | ----------- |
| 1st            | swipe left  |
| 2nd            | swipe right |
| 3rd (optional) | swipe up    |

A new question has _No_ left and _Yes_ right. A **Color** per option (red
_No_, green _Yes_) shows on the buttons and while dragging. Keep _No_ left
and _Yes_ right, and don't swap them during a study.

## How coders answer

- **Swipe**: drag the unit sideways (or up) and let go past about a third,
  or flick. Earlier, it springs back.
- **Tap** a button under the question.
- **Keys**: **←**, **→**, **↑**, or **1**, **2**, **3**.

Long units still scroll; swiping up only answers at the end of the text.
Outside a loop the question itself is the card. Tick **Show the unit on a
card while this question is asked** to frame the unit as a card.

## When to use it

Good for **quick, simple judgements on many units**: relevance filtering,
crowd coding on phones, training data for a classifier, _Would you share
this post?_ experiments.

Less suitable for more than three answers, judgements that need thought,
long texts, or when mistakes are costly (coders can go back, but must
notice first).

## Using the answers

As a single category: `$var.relevant.value`, `$var.relevant.label`, and
_is_ / _is one of_ in [conditions](conditions.md). It can also decide when
a shared unit is done (see [Shared queues](shared-queues.md)).
