---
title: Confirm
section: Question types
order: 6
summary: A question with one button - for instructions, consent texts and "I have read the text".
---

A **Confirm** question shows its text and a single button: **I confirm**.
There is nothing to choose; clicking the button moves the coder on. Use it
whenever you want coders to read something before they continue:

- **Instructions** at the start of a job, or before a new part of it.
- **Information and consent** in a survey experiment.
- **A check in a unit loop**: *I have read the whole article* before the
  questions about it.
- **A closing message**, such as a thank-you before the session ends.

A new question starts as a Confirm question, so the quickest way to add a
page of text is to add a question and fill in its **Question**.

## Writing the text

The **Question** is the main text, and **Instruction (optional)** a
smaller text under it. Both are markdown, so you can use headings, bold
text, lists and links, and both can use earlier answers (and in a unit
loop the unit's data):

```template
**Welcome, and thank you for taking part.**

You will read 20 short news articles and answer three questions about each.
This takes about 15 minutes.

- Read each article in full before you answer.
- There are no right or wrong answers.
```

For long instructions in a unit loop, a [snippet](snippets.md) saves you
from repeating the same text in several places.

## Consent that can be refused

A Confirm question can't be refused: the only way on is to click
**I confirm**. That is fine when consent was given elsewhere (on a panel's
own page, say), but if participants must be able to say no inside
AnnoTinder, use a [nominal question](nominal-and-ordinal.md) with two
options instead:

1. A nominal question `consent` with the options *I agree* (`yes`) and
   *I do not agree* (`no`).
2. A condition that holds when `$var.consent.is("no")`, with an
   [end item](end-items.md) in it that ends the session as screened out.

This also records the refusal in your data.

## What is stored

Only that the question was answered. In references, a Confirm question has
just `$var.<question>.answered`, which is true once the coder clicked the
button. It has no value or label.

In the results its column is `true` when the coder clicked the button, and
empty when a condition skipped the question.
