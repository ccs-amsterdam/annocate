---
title: Designing an annotation task
section: Design notes
order: 1
summary: Practical advice for content analysis and crowd coding - units, questions, categories, pilots, reliability, fatigue and phones.
---

A good annotation study is mostly decided before the first coder starts.
These are defaults from content analysis (Krippendorff, Neuendorf) and
crowd coding: depart from them on purpose.

## Start from the unit of analysis

Decide what one judgement is _about_ (an article, a sentence, a tweet): one
row of your CSV.

- **Split before you upload**: a row per paragraph or sentence, with the
  article's id as a column.
- **Give context on purpose**: extra fields in the
  [layout](layout-templates.md), visibly apart from what is judged (e.g. a
  grey box, see [Colours and styles](colours-and-styles.md)). Only what
  changes judgements.
- **Things inside a unit** (actors, claims) are [spans](span.md).
- **Things about the coder** go outside the loop.

## One judgement per question

- **Split compound questions**: _"Is the government mentioned?"_, then
  _"What is the tone towards it?"_.
- **Filter first**: show follow-ups with a [condition](conditions.md), so
  coders don't pick "not applicable" over and over.
- **General to specific**: politics? → which actor → which tone.

For crowd coders, fewer and simpler questions per unit, and more coders
per unit.

## Writing categories

- **Mutually exclusive and exhaustive**, unless you allow several
  answers. Frequent hesitation means overlapping definitions.
- **"Other", "Unclear", "Not applicable"** on purpose, defined, and
  watched in the pilot. Use the [special answers](nominal-and-ordinal.md#special-answers)
  for not applicable and don't know.
- **Short labels**: a label is a button, not a definition. Put
  definitions in the question's [instructions](questions.md#instructions).
  Short labels also fit side by side on phones.
- **Ordered?** Use [ordered options](nominal-and-ordinal.md).
- **Many categories** invite primacy effects: ask a broad topic first,
  then a subtopic.

## Instructions and training

Keep a full codebook document (you publish it with the study), and in the
tool:

- **Instructions** on each loop question, behind its **?** button,
  optionally opening by themselves the first time (see
  [Questions](questions.md#instructions)).
- **A practice round**: [practice units](special-units.md) with known
  answers give feedback when a coder is wrong. Or build your own feedback
  with [`::: from`](template-blocks.md):

```example
unit:
  headline: Parliament passes new budget after long night
  expert: politics
answers:
  topic: politics | economy | sports
steps: topic, feedback
---
## $unit.headline

:::: from feedback
::: if $var.topic.value === $unit.expert
**Correct.** The expert answer is *$unit.expert*.
::: else
The expert answer is **$unit.expert**. Check the definitions before you go on.
:::
::::
```

Here `feedback` is a [confirm question](confirm.md) after `topic`.

> Fields the design uses reach the coder's browser, also those shown
> later: don't put test units' expert answers in their data (use
> [gold units](special-units.md), whose answers stay on the server).

## Pilot, then test reliability

1. **Preview** the design on your real units, phone and desktop size.
2. **Pilot** with two or three coders on the same 30-50 units (see
   [Intercoder reliability designs](overlap.md#intercoder-reliability-designs)).
   Revise the definitions, not just the answers.
3. **Test reliability on new units**: at least 50, more for rare
   categories (Krippendorff 2018).
4. **Keep checking**: an overlap **spread through** the units shows drift.

AnnoTinder doesn't compute reliability: download the results and compute
Krippendorff's alpha per question (e.g. `irr` or `tidycomm` in R).
Changing the codebook during coding: see
[Changing a design while coding runs](changing-a-live-design.md).

## Order and fatigue

- **Random order** spreads learning and fatigue over units (see
  [Order](unit-distribution.md#order)); keep set order when order matters.
- **Limit work per coder**: quality drops after about an hour. Coders can
  stop and resume. In crowd coding, cap **Max units per coder** (see
  [Shared queues](shared-queues.md)).
- **Look at timing**: `timings.csv` shows implausibly fast coders.

## Crowd coding

Crowd coding (Benoit et al. 2016; Lind, Gruber and Boomgaarden 2017)
combines many untrained coders.

- **Simple tasks**: one or two questions, options anyone understands.
- **Several coders per unit** with a [shared queue](shared-queues.md);
  combine afterwards (e.g. majority), keep the individual answers.
- **Gold units** with known answers, checked silently; coders who fail
  too many can be screened out (see [Gold units](overlap.md#gold-units)).
- **Attention checks and screening** with [end items](end-items.md) (see
  [Online panels and crowd coding](online-panels.md)).

## Coders on phones

Questions are laid out for small phones (see
[The same form on every device](design-fixed-layouts.md)), but the task
must fit too: shorten long texts or recruit for desktop, use [swipe](swipe.md)
for fast yes/no, and test span selection on a real phone.

## What AnnoTinder doesn't do

- compute agreement or combine coders' answers;
- adjudicate disagreements (make a second loop or study for an expert);
- set time limits per unit or session.

## Further reading

- Krippendorff, K. (2018). _Content Analysis: An Introduction to Its
  Methodology_ (4th ed.). Sage.
- Neuendorf, K. A. (2017). _The Content Analysis Guidebook_ (2nd ed.). Sage.
- Benoit, K., Conway, D., Lauderdale, B. E., Laver, M., & Mikhaylov, S.
  (2016). Crowd-sourced text analysis. _American Political Science Review_,
  110(2), 278-295.
- Lind, F., Gruber, M., & Boomgaarden, H. G. (2017). Content analysis by the
  crowd. _Communication Methods and Measures_, 11(3), 191-209.
