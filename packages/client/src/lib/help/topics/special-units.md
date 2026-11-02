---
title: Overlap, gold and practice units
section: Units and distribution
order: 7
summary: Units every coder codes (overlap), units with a known answer checked silently (gold) or with feedback (practice) - written in your CSV, or made in AnnoTinder.
---

Three sets of a group have a special meaning. A loop that **assigns sets**
of the group, or a **crowd coding** queue over one of its sets, can mix them
in with each coder's own units:

| Set | Its units | Coders notice |
| --- | --- | --- |
| `_overlap` | coded by every coder of the group: to compare coders (reliability) | nothing |
| `_gold` | have a known answer: coders are checked silently | nothing, unless they fail (below) |
| `_practice` | have a known answer: coders are told when they are wrong | feedback per question, answer again |

Keep each unit in at most one of them: a gold unit that is also an overlap
unit is checked twice, and a practice unit tells coders the answer.

## Write them in your units

The most direct way: a **sets column** in your CSV (see
[Sets and set groups](sets.md#a-sets-column-in-your-csv)), and a column
with the right answer for each question you check. The right answer to the
question `sentiment` goes in the column `sentiment_gold` (gold units) or
`sentiment_practice` (practice units); a practice unit's own feedback in
`sentiment_practice_message`:

```text
id,text,part,sentiment_gold,sentiment_practice,sentiment_practice_message
a1,The minister resigned.,set1,,,
a2,Prices fell again.,set2,,,
a3,The team won the cup.,_overlap,,,
a4,The factory closed.,_gold,negative,,
a5,A new park opens.,_practice,,positive,It is good news for the neighbourhood.
```

Upload it and choose **sets** as the type of the `part` column. Coders never
get the answer columns: the Units page shows them as *server only*.

## Or let AnnoTinder make them

- **Overlap**: **Split units into sets** on the Units tab, with an overlap
  of, say, 10%, sets aside a random `_overlap` set. See [Overlap](overlap.md).
- **Gold and practice units**: put units in the set `_gold` or `_practice`
  (select them on the Units tab and add them to the set).
- **Right answers**: in the unit loop's **Units** tab, turn on **Gold** or
  **Practice**, tick the questions to check, and click **Create gold values…**
  (or **Write practice answers…**). It goes through the units with the
  loop's layout: choose the right answer, and for practice units, a message.
  Like any change to units, the answers are a draft until you deploy them.

## Right answers

A cell holds the right answer to one question:

| Cell | Right when the answer is |
| --- | --- |
| `positive` | exactly this option |
| `a;b` | exactly these options together (a question with several answers) |
| `positive\|neutral` | any of them |
| `3..5` | a number from 3 to 5 |

An empty cell: the unit isn't checked for that question. Deploying warns
about units without answers and answers that can never be right: a value
that isn't an option (or, for a number question, not a number), or a range
(`lo..hi`, for numbers and ordered options like a 1-5 scale) with no option
in it or outside the question's min and max. Numbers compare as numbers
(`3` matches 3.0).

## Practice units

Turn on **Practice** in the loop: placed **first** (a practice round,
recommended), spread through the coder's units, or last. For the questions
ticked, each answer is checked as it is given: a wrong one shows the unit's
own message, else the loop's **Message when wrong**, else the expected
answer, right with the question, and the coder answers again until right.
Untick **Answer again until right** to let them go on after the message
instead. A right answer shows a short check. How many tries each question
took is in the export (`timings.csv`, `practice_tries`).

Practice units come with their answers, so a coder who looks behind the
scenes can find them; that's fine for practice. Gold answers never leave
the server.

A layout or question can show something on practice units only:
`$unit._practice` is true there (e.g. `::: if $unit._practice`). A
question's instruction can be shown **only on practice units**, or only the
first time a coder sees the question.

## Gold units

Turn on **Gold** in the loop and tick the questions to check. Coders see
nothing: gold units look like any other. With **End the session when a coder
answers too many wrong**, every coder starts with a *health* (e.g. 5) that
goes down per wrong answer (e.g. by 1), and up per right one if you like
(never above the start). At 0 the session ends at an
[end item](end-items.md) with the outcome *screen-out*: its message and
redirect apply.

The answers to gold units are in the results like any other, so you can
also compute coders' accuracy afterwards.
