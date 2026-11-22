---
title: Overlap, gold and practice units
section: Units and distribution
order: 7
summary: Units every coder codes (overlap), units with a known answer checked silently (gold) or with feedback (practice) - written in your CSV, or made in AnnoTinder.
---

Three values of the coder unit assignment's [set column](sets.md) are
special: the coders' column (specific coders), or a crowd's optional
**Set column**. In other columns they are ordinary values, and without an
assignment column there are no special units. Every loop mixes them in
with each coder's units; the loop's **Units** tab has a row for each with
**Spread throughout** (default), **Before coding units**, **After coding
units** or **Leave out** (see [Overlap](overlap.md#placement)). A row is
disabled when the column has none of that kind.

| Set         | Its units                                          | Coders notice                    |
| ----------- | -------------------------------------------------- | -------------------------------- |
| `_overlap`  | coded by every coder, for reliability              | nothing                          |
| `_gold`     | known answer, checked silently                     | nothing, unless they fail        |
| `_practice` | known answer, coders told when wrong               | feedback, answer again           |

Keep each unit in one of them only.

## Write them in your units

A set column in your CSV plus a column with the right answer per checked
question: `sentiment_gold` or `sentiment_practice`, and optional feedback
in `sentiment_practice_message`:

```text
id,text,part,sentiment_gold,sentiment_practice,sentiment_practice_message
a1,The minister resigned.,set1,,,
a2,Prices fell again.,set2,,,
a3,The team won the cup.,_overlap,,,
a4,The factory closed.,_gold,negative,,
a5,A new park opens.,_practice,,positive,It is good news for the neighbourhood.
```

Give `part` the type **set** and choose it in **Coder unit assignments**.
Coders never get the answer columns (_server only_).

## Or make them in AnnoTinder

- **Overlap, practice and gold units**: **Create new coder
  distribution…** (specific coders) or **Create special units…** (a crowd)
  in **Coder unit assignments**: an amount of overlap units, and with
  **Practice units** or **Gold units** ticked, an amount of those (a
  number or %). Or **Fill a set column** with an overlap.
- **Single units**: select units on **Units** → **Put in** `_gold` or
  `_practice` (in the assignment's column).
- **Right answers**: on the loop's **Units** tab, under **Gold units** or
  **Practice units**, tick the questions and click **Create gold values…**
  or **Write practice answers…**: step through the units and pick the right
  answer (and a message). Drafts until deployed.

## Right answers

| Cell                | Right when the answer is            |
| ------------------- | ----------------------------------- |
| `positive`          | this option                         |
| `a;b`               | exactly these options (several answers) |
| `positive\|neutral` | any of them                         |
| `3..5`              | a number (or ordered value) from 3 to 5 |

Empty: not checked. Deploying warns about units without answers and
answers that can never be right.

## Practice units

Best placed **Before coding units**, as a practice round. Tick the questions under
**Practice units: questions with feedback when a coder answers wrong**. A
wrong answer shows the unit's message, else the loop's **Message when
wrong**, else the expected answer, and the coder answers again (untick
**Answer again until right** to let them go on). Tries are in
`timings.csv` (`practice_tries`).

`$unit._practice` is true on practice units (`::: if $unit._practice`). A
question's [instructions](questions.md#instructions) can open by
themselves on practice units. Practice answers reach the browser; gold
answers never do.

## Gold units

Tick the questions under **Gold units: questions checked silently**. With
**End the session when a coder answers too many wrong**, coders start with
a _health_ (e.g. 5) that drops per wrong answer (and optionally rises per
right one); at 0 the session ends as screened out, at an
[end item](end-items.md). Gold answers are in the results, for accuracy
afterwards.
