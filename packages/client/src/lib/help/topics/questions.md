---
title: Questions
section: Editor
order: 2
summary: What a question item is - its name, its text and instruction, where it goes in the design, and its answer type.
---

Add a question with the **+** in the tree (see
[The design editor](design-editor.md#adding-items)). It has a **name**, a
**question text**, an **answer type** and, in a unit loop, optional
**instructions**.

## The name

**Item Name** is the question's column in the results and how other parts
refer to it (`$var.topic`, see
[Referring to answers and unit data](references.md)).

- letters, digits and `_` only (`topic`, `q3_actor`); at most 128
  characters;
- unique in the design, including end items.

Use short names that say what is measured: `tone`, not `question_4`.

### Renaming is a new question

Answers are stored under the name. Once coders answered, a new name is a
new question: old answers stay under the old name, coders are asked again,
and finished units count as unfinished. To change only the wording, edit
the question text. See
[Changing a design while coding runs](changing-a-live-design.md).

## The question text

**Question** is what coders read above the answers. It is a template:
markdown, earlier answers (`$var.role.label`), in a loop the unit's data
(`$unit.headline`) and [snippets](snippets.md), and `{{ }}`
[scripts](scripts.md).

```example
unit:
  headline: Minister resigns
answers:
  role: student | journalist
---
You said you are a **$var.role.label**.
Is *$unit.headline* about politics?
```

A question can only use questions asked **before** it, and only questions
in a loop can use `$unit`; the editor says when something is wrong.

A short one-paragraph question (up to about 150 characters) is shown as a
heading; longer texts are shown as written. Keep the first line short: the
coder's menu lists questions by it.

## Instructions

A question in a unit loop can have an **Instruction (optional)**: how to
apply the question, for coders to look up while coding. It is your
codebook text for this question, as long as needed.

```text
Question:     What is the main topic of this article?
Instruction:  The topic the article spends most words on. Ignore topics
              mentioned in passing. With two equal topics, choose the
              first one mentioned.
```

Coders open it with the **?** button by the question or the **?** key. A
dot marks the button until it was opened once. **Also opens by itself**:
the first time a coder gets the question, or on
[practice units](special-units.md).

Questions outside loops have no instruction: write everything in the
question text.

## Focus on

For a loop question, **Focus on (optional)** picks the part of the unit
the question is about: the unit scrolls there and highlights it; **Dim the
rest of the unit** fades the rest. The list offers what the layout shows
(`unit.headline`, or a named block, see
[Typed blocks and names](typed-blocks.md#ids)).

## Where a question goes

| Where                       | Asked                         | Results                                     |
| --------------------------- | ----------------------------- | ------------------------------------------- |
| A questions block           | once per coder                | `coders.csv`: a row per coder               |
| A unit loop                 | once per unit                 | `annotations.csv`: a row per unit and coder |
| In a block with a condition | only when the condition holds | as above; empty when skipped                |

Texts, layouts and conditions can only use earlier answers, and a loop's
answers can't be used in another loop.

## The answer type

A new question asks you to **choose an answer type**: categories, ordered
options, a number, a scale, swipe, confirm, and in a loop also mark text
and relations. Its settings appear below. See
[Choosing a question type](question-types.md).

Changing the type keeps the question text; between categories and ordered
options the options are kept too.
