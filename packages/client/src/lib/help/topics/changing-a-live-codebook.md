---
title: Changing a codebook while coding runs
section: Codebook
order: 7
summary: What happens to finished units, units in progress and earlier answers when you publish a new version during a study, and how to change things safely.
---

You can keep improving a codebook after coders started: edit the draft and
publish it (see [Preview, save and publish](previewing-and-publishing.md)).
Nothing coders answered is ever overwritten or deleted. But some changes
affect the units coders already finished, or what earlier answers mean.
This page says what each kind of change does, so you can decide before you
publish.

Two rules explain most of it:

- **Answers are stored per question name**, together with the codebook
  version they were given under. A new version doesn't touch them.
- **A unit counts as finished when every question of its loop has an
  answer** in the *current* version (a question a condition hid counts as
  answered: it is stored as skipped). Add a question, and units finished
  before lack its answer.

## What each change does

| Change | Units coders already finished | The unit a coder has open, and units still to come |
| --- | --- | --- |
| **Question added** to a loop | Unfinished again: coders get them back, with their earlier answers, and only answer what is new | The new question is asked |
| **Question added** outside a loop | (not about units) Coders are asked it once they switch to the new version, before they continue | Asked |
| **Question removed** | Their answers stay in the data (and in the download), but the question is no longer asked | Not asked |
| **Option value** removed or changed | Stay finished. Answers with the old value stay in the data, but no longer fit the question: a coder who goes back to such a unit must answer it again | Only the current options |
| **Option label** changed | Nothing changes: answers hold values, not labels | Coders see the new label |
| **Answer type** changed | As a removed value: earlier answers no longer fit | The new type |
| **Question renamed** | As removing the old question and adding a new one: units are unfinished again | Asked under the new name |
| **Question text, instruction or layout** changed | Stay finished | Coders see the new text |
| **Conditions or order** changed | Stay finished | Follow the new codebook |
| **Distribution** changed (the loop's **Units** tab) | Coders keep the units they were given, as long as the loop still hands out those units in the same way; otherwise they are routed again (see [Different units for different coders](coder-groups.md#routing-is-sticky)) | The new rules apply |

Units and unitsets are not part of the codebook: units you upload and sets
you make while coding runs are handed out right away, without a new version
(see [Unitsets](unitsets.md)).

The publish dialog warns about removed option values and changed answer
types, before you publish. After publishing, it warns if a loop gained
questions while coders had finished units in it, with the number of
codings that are unfinished again.

### Units that become unfinished again

When a loop gains a question, every unit that coders finished in it lacks
the new answer, so it counts as unfinished: in the **Overview** progress,
on the **Coders** tab, and for handing out units.

- In loops where each coder has their own units (**All units**, **One set
  per coder**, **The invitation's units**), these units come earlier in the
  coder's order, so they come back first, before new units. The coder sees
  their earlier answers and only answers the new question.
- In a shared queue (**Units shared among coders**), they go back into the
  queue, and count again for how many coders a unit still needs. See
  [Shared queues](shared-queues.md).
- This also happens when a condition hides the new question for some
  units: the coder gets the unit back, finds everything answered, and
  confirms the last answer once more.
- Coders who already stopped don't come back by themselves. Their units
  stay unfinished, and the new question stays empty for them in the
  results.

### Earlier answers in the results

The download keeps every answer that counts (see
[Downloading results](results.md)):

- Each row of `annotations.csv` says which codebook version the answers
  were given under (`codebook_id`), and which version of the unit the coder
  saw.
- Answers to a question you removed or renamed still have their column,
  after the columns of the current questions.
- With **Add label columns**, an answer's label is the one in the version
  it was given under: what the coder saw.

## What coders who are working see

Coders don't need to reload. When their browser next talks to the server,
they switch to the new version and continue where they were, usually on
the same unit, with their answers to it as far as they still fit. See
[What coders experience when you publish](previewing-and-publishing.md#what-coders-experience-when-you-publish).

## Resetting answers

To have units coded again, for instance after a question changed meaning or
a coder turned out to misunderstand it, **reset** answers to some
questions. Reset answers are kept for analysis, but no longer count: the
units are unfinished again, and coders get them again (the same coders too,
who see them unanswered).

Where to reset:

- **Coders** tab, **Reset answers…**: the answers of all coders.
- **Coders** tab, the reset icon in a coder's row: that coder's answers.
- **Units** tab: select units, then **Reset answers…**: the answers to
  those units.

Then choose the questions: all questions of a loop, or some. Only answers in
unit loops can be reset. To keep the reset answers in your download, tick
**Include answers that were reset** on the **Results** tab
(`reset_answers.csv`, see [Downloading results](results.md)).

## Advice

- **Pilot before you publish to real coders.** Most changes are cheap
  before anyone codes, and every change during a study is a change in your
  measurement instrument. Use **Preview**, and a pilot with two or three
  coders on the same units.
- **Labels and texts can change; values can't.** Clarifying a label,
  fixing a typo or adding an example to an instruction is safe. Don't give
  an existing value a new meaning (turning `economy` into "Economy and
  finance" changes what earlier `economy` answers mean); add a new option
  instead. See [Values and labels](design-values-and-labels.md).
- **Don't rename questions** once coding started. Change the question text
  instead.
- **Adding a question costs your coders time**: all their finished units
  come back. If the new question only matters from now on, consider a new
  loop or a new job instead.
- **Write a version note** for every publish that says what changed and
  why. Report the changes, and the moment they were made, in your methods
  section.
- **Check the warnings** in the publish dialog. If one surprises you,
  click **Cancel** and look at the change again. The warning about
  unfinished units only comes after publishing; to undo that change,
  restore the previous version as the draft from **Versions** and publish
  it. The units then count as finished again, as before.
