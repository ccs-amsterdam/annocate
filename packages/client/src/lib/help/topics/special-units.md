---
title: Overlap, gold and practice units
section: Units and distribution
order: 7
summary: Test units - every coder codes them (overlap), their known answer is checked silently (gold) or with feedback (practice) - written in your CSV, or made in AnnoTinder.
---

**Test units** are the units with a value in the units' `test_unit`
column: `overlap`, `practice` or `gold` (one per unit; empty: a coding
unit). They are everyone's: every coder gets them besides their own units
(`coder_set` and `condition_set` don't select them). A test unit with a
part (`part_set`) is only in the loops of that part.

Every loop mixes them in with each coder's units; the loop's form has a
row for each type with **Spread throughout** (default), **Before coding
units**, **After coding units** or **Leave out** (see
[Overlap](overlap.md#placement)). A row is disabled when the units have
none of that type.

| `test_unit` | Its units                                          | Coders notice                    |
| ----------- | -------------------------------------------------- | -------------------------------- |
| `overlap`   | coded by every coder, for reliability              | nothing                          |
| `gold`      | known answer, checked silently                     | nothing, unless they fail        |
| `practice`  | known answer, coders told when wrong               | feedback, answer again           |

## Write them in your units

A `test_unit` column in your CSV, plus a column with the right answer per
checked question, `answer_<question>` (for practice and gold units alike),
and optional feedback on practice units in `feedback_<question>`:

```text
id,text,coder_set,test_unit,answer_sentiment,feedback_sentiment
a1,The minister resigned.,anna,,,
a2,Prices fell again.,bob,,,
a3,The team won the cup.,,overlap,,
a4,The factory closed.,,gold,negative,
a5,A new park opens.,,practice,positive,It is good news for the neighbourhood.
```

Columns with these names are taken as such when uploading. Coders never
get the answer and feedback columns (_server only_).

## Or make them in AnnoTinder

- **A number of test units**: **Create coder set…** / **Update coder
  set…** (Specific coders, in **Coder unit assignments**) shows the current
  test units; with **Redistribute test units**, give a number of overlap,
  practice and gold units and they are drawn anew (at random).
- **Single units**: select units on **Units** → **Put in** `gold`,
  `practice` or `overlap` of `test_unit`.
- **Right answers**: in the loop's form, under **Gold units** or
  **Practice units**, tick the questions and click **Create gold values…**
  or **Write practice answers…**: step through the units (shown with the
  loop's first layout) and pick the right answer (and feedback). They are
  written to `answer_<question>` (and `feedback_<question>`). Drafts until
  deployed.

## Right answers

| Cell                | Right when the answer is            |
| ------------------- | ----------------------------------- |
| `positive`          | this option                         |
| `a;b`               | exactly these options (several answers) |
| `positive\|neutral` | any of them                         |
| `3..5`              | a number (or ordered value) from 3 to 5 |

Empty: not checked. Deploying warns about test units without answers and
answers that can never be right.

## Practice units

Best placed **Before coding units**, as a practice round. Tick the questions under
**Practice units: questions with feedback when a coder answers wrong**. A
wrong answer shows the unit's feedback (`feedback_<question>`), else the
loop's **Message when wrong**, else the expected answer, and the coder
answers again (untick **Answer again until right** to let them go on).
Tries are in `timings.csv` (`practice_tries`).

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
