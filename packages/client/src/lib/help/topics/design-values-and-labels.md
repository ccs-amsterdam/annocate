---
title: Values and labels
section: Design notes
order: 2
summary: Why every option has a stored value and a shown label, why labels can change safely and values can't.
---

Every option of a question has two parts: a **label**, which coders see, and
a **value**, which is stored. This is how SPSS and Stata handle categorical
variables ("value labels"), and how R's factors separate levels from labels.
It keeps your data stable while the wording coders see can still improve.

| | Label | Value |
| --- | --- | --- |
| What it is for | People: coders, and you when you read results | Data: storage, conditions, analysis |
| Example (nominal) | Human interest story | `human_interest` |
| Example (ordinal) | Somewhat negative | `2` |
| Safe to change after coding started? | Yes | No |

## Values are data, labels are for people

An answer is stored as the option's value, never as its label. Everything
that works with answers uses the value:

- **The results**: the answer columns hold values. The `_label` columns next
  to them (on by default) add the label the coder saw.
- **Conditions**: a rule such as *topic is Politics* is stored as a
  comparison with the value, `$var.topic.is("politics")`.
- **Assigned groups and coder routing**: `$var.group.value` in a unitset name
  uses the value.

Labels are only what coders see, and what templates show when you write
`$var.topic.label` (see [Referring to answers and unit data](references.md)).

Separating the two has three advantages:

1. **You can improve the wording** while coding runs, or translate it, without
   touching the data.
2. **Values can be made for analysis**: short, without spaces or accents, the
   same in every study (`human_interest`, `economy`), or numbers that carry
   the order of an ordinal scale.
3. **Conditions don't break** when you fix a typo in a label.

## Choosing values

- **Nominal questions** have text values. The editor proposes one from the
  label ("Human interest" becomes `human_interest`) and keeps it in step with
  the label until you type a value yourself. Good values are short,
  lower case, and mean something on their own: someone reading your data
  without the codebook should be able to guess them.
- **Ordinal questions** (and scales) have number values that rise in the
  order of the options, 1, 2, 3 by default, so that "higher value" means
  "further along the scale". To use other numbers, such as -2 to 2 for a scale
  from very negative to very positive, tick **Custom values**. They must still
  rise in the order of the options.
- **Values are unique** within a question, and nominal values can't be empty.

Pick values with the analysis in mind, before coding starts. They end up as
column contents in your data, your scripts and your paper's replication
materials.

## Changing labels is safe

You can change a label at any time, also after coding started. Earlier
answers keep their value, so they keep their meaning. The download shows, for
each answer, the label *in the codebook version it was given under* (what the
coder saw), and `variables.csv` lists every version's labels, so a changed
label stays traceable.

> In a nominal question whose value still follows its label, editing the
> label changes the value too. After you change a label in a codebook that
> coders already use, check the **Value (stored)** box: type the old value
> back if it changed. The publish dialog warns you if you forget (see below).

## Changing values is not

Changing a value changes what earlier answers mean. If you rename the value
`eco` to `economy`, the answers stored as `eco` no longer belong to any
option:

- they stay in the database, and in your download, as `eco`;
- coders who go back to such a unit see the question unanswered and answer
  it again;
- your analysis now has two values for one category, and you have to merge
  them yourself.

Removing an option has the same effect for the answers that chose it.
Changing a question's type (for example from nominal to ordinal) changes
every value at once.

> **Watch out with ordinal options.** Without **Custom values**, ordinal values
> follow the order of the options. Moving an option, or adding one anywhere
> but at the end, renumbers the options after it: an answer stored as `3` then
> means something else, although no value disappeared. The publish dialog
> warns when an option ends up with another value (*the value 3 was "Agree"
> and is now "Neutral"*). Add new options at the end, or make a new question.

## The publish warnings

When you publish, the dialog compares the new version with the live one and
warns about value changes before you confirm:

| Warning | What it means |
| --- | --- |
| *'topic' no longer has the value "eco": earlier answers with it no longer fit.* | An option's value was changed or the option was removed |
| *'tone' changed from nominal to ordinal: earlier answers no longer fit.* | The question's type changed |
| *'tone': the value 3 was "Agree" and is now "Neutral": earlier answers 3 will read as "Neutral".* | An option moved to another value, e.g. ordinal options renumbered after a move |

After publishing, AnnoTinder may also tell you that a loop *gained questions*:
coders get the units they finished back, to answer only the new questions.
See [Changing a codebook while coding runs](changing-a-live-codebook.md).

## When the meaning changes, make a new question

If a category is split in two, merged with another, or redefined, earlier
answers were given to a different question. Say so in the data: give the
question a new **name**. A new name is a new question (a new column in the
results); answers to the old one stay in the data, tagged with the version
they were given under. You can then decide in your analysis how the two
relate, instead of having one column that silently means two things.

The same goes for scale items: an item's name is its column, so renaming an
item starts a new one.

## What AnnoTinder doesn't do

- It doesn't recode earlier answers when you change a value. Recoding is part
  of your analysis, where it is documented.
- It doesn't keep labels in several languages. To code in two languages,
  make a question per language, or one job per language, with the same
  values.
