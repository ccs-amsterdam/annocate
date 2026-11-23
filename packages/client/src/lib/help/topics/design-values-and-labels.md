---
title: Values and labels
section: Design notes
order: 2
summary: Why every option has a stored value and a shown label, why labels can change safely and values can't.
---

Every option has a **label** (shown) and a **value** (stored), as SPSS and
Stata value labels or R factors. The wording can improve while the data
stays stable.

|                               | Label                 | Value                           |
| ----------------------------- | --------------------- | ------------------------------- |
| For                           | people                | data: storage, conditions, analysis |
| Example (categories)          | Human interest story  | `human_interest`                |
| Example (ordered)             | Somewhat negative     | `2`                             |
| Safe to change during coding? | yes                   | no                              |

## Values are data, labels are for people

Answers are stored as values. The results, conditions
(`$var.topic.is("politics")`) and experiments all use values; labels
are what coders see and what `$var.topic.label` shows. So you can reword or
fix labels without touching the data, and choose values for analysis.

## Choosing values

- **Categories**: text values, proposed from the label until you type
  your own. Short, lower case, guessable without the codebook. Numbers
  work for an existing codebook (see
  [Numeric values](nominal-and-ordinal.md#numeric-values)).
- **Ordered options and scales**: rising numbers, 1, 2, 3 by default, or
  **Custom values** (e.g. -2 to 2).
- Unique within a question.

Choose them before coding starts: they end up in your scripts and
replication materials.

## Changing labels is safe

Earlier answers keep their value. The download shows the label each coder
saw, and `variables.csv` lists every version's labels.

> In a category whose value still follows its label, editing the label
> changes the value too. After changing a label in a live design, check
> **Value (stored)** and type the old value back if needed.

## Changing values is not

Renaming `eco` to `economy` leaves the old answers as `eco`, belonging to
no option: they stay in the data, coders going back must answer again, and
you merge two values yourself. Removing an option or changing a type has
the same effect.

> **Ordered options**: without **Custom values**, moving or inserting an
> option renumbers the ones after it, so `3` means something else. Add new
> options at the end.

## The deploy warnings

| Warning                                                                                           | Means                         |
| ------------------------------------------------------------------------------------------------- | ----------------------------- |
| _'topic' no longer has the value "eco": earlier answers with it no longer fit._                   | value changed or removed      |
| _'tone' changed from nominal to ordinal: earlier answers no longer fit._                          | type changed                  |
| _'tone': the value 3 was "Agree" and is now "Neutral": earlier answers 3 will read as "Neutral"._ | an option got another value   |

See also [Changing a design while coding runs](changing-a-live-design.md).

## When the meaning changes, make a new question

If a category is split, merged or redefined, give the question a new
**name**: a new column, with the old answers kept apart. The same for scale
items.

AnnoTinder doesn't recode earlier answers (do it in your analysis) and
doesn't keep labels in several languages (use a question or study per
language, with the same values).
