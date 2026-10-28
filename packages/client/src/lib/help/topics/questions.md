---
title: Questions
section: Codebook
order: 2
summary: What a question item is - its name, its text and instruction, where it goes in the codebook, and its answer type.
---

A **question** is an item that coders answer. Every question has a
**name**, a **question text**, an optional **instruction**, and an
**answer type** that decides how coders answer and what is stored. You add
one with the **+** in the codebook tree (see
[The codebook editor](codebook-editor.md#adding-items)), and edit it in the
form on the right.

## The name

**Item Name** is how AnnoTinder knows the question. It is:

- the **column name** in your results (`annotations.csv` or `coders.csv`);
- how other parts of the codebook **refer** to the answer: `$var.topic`
  in a text, a layout or a condition (see
  [Referring to answers and unit data](references.md)).

Rules:

- letters, digits and `_` only: `topic`, `tone_headline`, `q3_actor`. No
  spaces, dashes or accents;
- at most 128 characters;
- unique in the whole codebook, including end items. A second `topic`
  gives the issue *Duplicate name 'topic'*.

Choose short names that say what the question measures, as you would name
variables in R or SPSS: `tone`, not `question_4`. Names that start with a
letter are easiest to use in R and Python.

### Renaming is a new question

Answers are stored under the question's name. While you are still writing
the codebook, rename freely. Once coders have answered, a new name is a new
question: answers given under the old name stay in the data under the old
name, coders are asked the "new" question again, and units they finished
count as unfinished. Change the **question text** instead if you only
want other wording. See
[Changing a codebook while coding runs](changing-a-live-codebook.md).

## The question text

**Question** is what coders read above the answers. It is a template, like
a unit's layout:

- **markdown**: `**bold**`, `*italic*`, lists and links work;
- **answers to earlier questions**: `$var.role.label` is filled in with the
  coder's answer to `role`;
- in a unit loop, also **the unit's data**: `$unit.headline`, and the
  loop's [snippets](snippets.md);
- `{{ ... }}` for a small [script](scripts.md), if you need one.

```example
unit:
  headline: Minister resigns
answers:
  role: student | journalist
---
You said you are a **$var.role.label**.
Is *$unit.headline* about politics?
```

Try both answers to `role` above. A question can only refer to questions
that come **before** it (it can't refer to itself, or to a question asked
later), and only a question in a loop can use `$unit`. The editor checks
this and says what is wrong, e.g. *'topic' is asked after this point*. More
in [Layout templates](layout-templates.md) and
[Referring to answers and unit data](references.md).

Keep the first line short: coders' **Navigation** menu lists questions by
the first line of their text (see
[What coders see](coder-experience.md#the-top-bar)).

## The instruction

**Instruction (optional)** is shown under the question text, in smaller
grey text. It is a template like the question text. Use it for a short
reminder that coders need while answering: what counts, what doesn't, what
to do in doubt.

```text
Question:     What is the main topic of this article?
Instruction:  The topic the article spends most words on. Ignore topics
              mentioned only in passing.
```

The instruction is shown under the question every time it comes up.
Long instructions are better placed before the coding starts, for example
as a **Confirm** question (see [Confirm](confirm.md)).

## Focus on

For a question in a unit loop, **Focus on (optional)** picks the parts of
the unit the question is about: when the question comes up, the unit
scrolls to the first and highlights it briefly, and with **Dim the rest of
the unit** everything else fades back. Use it when units are long and each
question is about a different part, such as the headline for one question
and a table for the next. The list offers what the loop's layout shows, by
id: `unit.headline` for `$unit.headline`, or a named block (see
[Typed blocks and names](typed-blocks.md#ids)). A span question focuses on
the fields it selects in unless you choose otherwise.

## Where a question goes

Where you put a question in the tree decides how often it is asked:

| Where | Asked | Answers end up in |
| --- | --- | --- |
| Outside a unit loop | once per coder | `coders.csv`: a row per coder |
| Inside a unit loop | once per unit, for every unit the coder gets | `annotations.csv`: a row per unit and coder |
| Inside a condition | only when the condition holds; otherwise skipped, and left empty in the results | as above |

Questions outside a loop are for things about the coder or participant:
consent, background questions, a check of the instructions, an
experimental manipulation. Questions in a loop are about the unit: its
topic, tone, actors.

Order matters too. Coders meet the items from top to bottom, and texts,
layouts and conditions can only use answers to questions that come earlier.
A question in one loop can't be used in another loop: each loop's answers
belong to its units.

## The answer type

**Answer Type** decides how coders answer and what is stored: categories,
ordered categories, a number, a scale of items, a swipe, a confirm button,
an assigned value, or selected text. The list only shows the types that
fit where the question is: **Auto** only outside loops, **Span** and
**Relation** only inside them. Below **Answer Type** the form shows the
settings of that type, such as its options.

See [Choosing a question type](question-types.md) for all types and when to
use which.

Changing the answer type keeps the question text and instruction. Between
nominal and ordinal the options are kept too; to any other type, the other
settings start from that type's defaults.
