---
title: Confirm
section: Question types
order: 6
summary: A question with one button - for instructions, consent texts and "I have read the text".
---

A **Confirm** question shows its text and one button, **I confirm**. Use
it when coders must read something before they go on:

- instructions at the start, or before a new part;
- information about the study;
- in a loop: _I have read the whole article_;
- a closing message.

## Writing the text

The **Question** is the text: markdown (headings, lists, links) with
references to earlier answers (and in a loop the unit's data):

```template
**Welcome, and thank you for taking part.**

You will read 20 short news articles and answer three questions about each.
This takes about 15 minutes.

- Read each article in full before you answer.
- There are no right or wrong answers.
```

For instructions coders look up while coding, use a loop question's
[instructions](questions.md#instructions) or a [snippet](snippets.md).

## Consent that can be refused

Confirm can't be refused. If coders must be able to say no:

1. a [categories](nominal-and-ordinal.md) question `consent`: _I agree_
   (`yes`), _I do not agree_ (`no`);
2. a branch with the condition `$var.consent.is("no")` and a
   screened-out [end item](end-items.md).

This also records the refusal.

## What is stored

Only that it was answered: `$var.<question>.answered`. The results column
is `true`, or empty when skipped.
