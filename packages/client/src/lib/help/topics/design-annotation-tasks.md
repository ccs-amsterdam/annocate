---
title: Designing an annotation task
section: Design notes
order: 1
summary: Practical advice for content analysis and crowd coding - units, questions, categories, pilots, reliability, fatigue and phones.
---

A good annotation study is mostly decided before the first coder starts:
what a unit is, which judgements coders make, how categories are worded, and
how you check that coders agree. This page collects established practice from
content analysis (Krippendorff, Neuendorf) and crowd coding, and shows where
AnnoTinder helps.

It is opinionated. Every study has its own constraints, so read it as a list
of defaults to depart from on purpose, not as rules.

## Start from the unit of analysis

Decide first what one judgement is *about*: a whole news article, a
paragraph, a sentence, a tweet, an image. In AnnoTinder that is a **unit**:
one row of the CSV file you upload. Everything a unit loop asks, it asks once
per unit.

- **Split before you upload.** If you want judgements per paragraph or per
  sentence, make each paragraph a row of its own (with the article's id as an
  extra column, so you can join them later). Don't ask coders to "rate each
  paragraph" of a long text in one question.
- **Give context on purpose.** A sentence often can't be judged without its
  headline or the previous sentence. Show context as extra fields in the
  [layout](layout-templates.md), visibly separate from the part coders judge
  (for example in a grey box, see [Colours and styles](colours-and-styles.md)).
  More context costs reading time, so add only what changes judgements.
- **Things inside a unit** (the actors in an article, the claims in a speech)
  are [spans](span.md): coders select them in the text, and each selection is
  stored with its position.
- **Things about the coder** (consent, background, experimental group) are
  asked once, outside the loop. See [Questions](questions.md).

## One judgement per question

Each question should ask for one judgement, with one answer coders can give
without weighing two things against each other.

- **Split compound questions.** *"Is the article negative about the
  government?"* mixes a target and a tone. Ask *"Is the government
  mentioned?"*, then *"What is the tone towards the government?"*.
- **Filter first.** If a question only makes sense for some units, ask a
  filter question first and show the follow-ups only when they apply, with a
  [condition](conditions.md). Coders then don't have to pick "not applicable"
  over and over, and your data says *why* a question is empty: it was skipped.
- **Keep each question's frame small.** Coders read the unit once, then answer
  several questions about it. Put the questions in the order a careful reader
  would think about them: from general (is this about politics?) to specific
  (which actor, which tone).

A loop with many questions per unit is fine for trained coders. For crowd
coders, fewer and simpler questions per unit work better: give the same unit
to more coders instead.

## Writing categories

The categories of a question are its **options**. Each has a label coders see
and a value that is stored (see [Values and labels](design-values-and-labels.md)).

- **Mutually exclusive and exhaustive.** Each unit fits exactly one option,
  unless you allow several (**Allow several answers**). If coders often hesitate
  between two options, the definitions overlap.
- **Decide about "Other", "Unclear" and "Not applicable".** They are useful,
  but coders use them as an escape when a judgement is hard. Add them on
  purpose, define when to use them, and watch how often they are used in the
  pilot.
- **Short labels.** A label is a button, not a definition. "Human interest"
  rather than "The article focuses on a personal story". Put definitions in
  the question's **Instruction** or the coder instructions. Short labels also
  let AnnoTinder show options side by side on a phone (see
  [How answers are laid out](answer-layouts.md)).
- **Ordered or not.** If the options have an order (negative, neutral,
  positive), use an [ordinal question](nominal-and-ordinal.md): the stored
  values are numbers in that order, which is what your analysis needs.
- **Many categories.** A list of 30 topics is hard to use and invites
  primacy effects (options at the top are picked more). Consider two steps: a
  broad topic first, then a subtopic shown with a condition.

## Instructions and training

Coders need a codebook document with definitions and examples, and training
before they code the real material.

- **Short reminders in the tool.** Use the question's **Instruction** for a
  one-line definition. Longer texts that should appear with every unit can go
  in a [snippet](snippets.md). Keep the full codebook document as well: it is
  what you publish with the study.
- **A training round with feedback.** Make a separate loop with training
  units before the real one, and give the training units a column with the
  expert answer. With [`::: from`](template-blocks.md) the layout can show
  that answer after the coder has given their own:

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

Switch between the answers and pick the question on screen to see what the
coder sees before and after answering. Here `feedback` is a
[confirm question](confirm.md) after `topic`: it shows the feedback and a
button to go on.

> A field the codebook uses is sent to the coder's browser, also when it is
> only shown later. That is fine for training, but don't put the expert answer
> of your *test* units in their data.

## Pilot, then test reliability

1. **Preview** the codebook yourself, on your real units, at phone and desktop
   size. Nothing is stored. See [Preview, save and publish](previewing-and-publishing.md).
2. **Pilot** with two or three coders on the same 30 to 50 units: a pilot
   set that every coder codes in full (**Everyone codes everything**, with that set as unitset, see
   [Intercoder reliability designs](overlap.md#intercoder-reliability-designs)).
   Talk through the
   disagreements and revise the definitions, not just the answers.
3. **Test reliability on new units**, not the pilot units: coders have
   discussed those. Content analysis textbooks recommend a reliability sample
   of at least 50 units, and more for rare categories; Krippendorff (2018)
   gives a way to compute the size you need.
4. **Keep checking during coding.** An overlap set spread through the units
   (placement **Spread through them**) shows whether coders drift apart over
   time. **Before the coder's units** measures agreement at the start, when
   coders are fresh but still learning.

AnnoTinder doesn't compute reliability. Download the results and compute
Krippendorff's alpha (or another coefficient that fits your measurement
level) per question, for example with the `irr` or `tidycomm` package in R.
Report it per question, not one number for the whole codebook. For ways to
set up the overlap, see
[Intercoder reliability designs](overlap.md#intercoder-reliability-designs).

You can keep improving the codebook while coding runs, but each change makes
the data harder to interpret. See
[Changing a codebook while coding runs](changing-a-live-codebook.md).

## Order and fatigue

- **Random order.** In the loop's **Order**, **Random (each coder their own
  order)** spreads order effects (learning, fatigue, anchoring on the first
  units) over all units, instead of piling them up on the units that come
  first. Keep **In unitset order** when the order matters, for example
  sentences of one text. See [Order](unit-distribution.md#order).
- **Limit the work per coder.** Coding quality drops after an hour or so of
  concentrated work. Coders can stop and resume later, on the same device or
  another one, so long jobs can be spread over days. For crowd coding, cap
  the units per coder: **Units per coder, at most** in a
  [shared queue](shared-queues.md), or split the units into smaller
  [unitsets](unitsets.md).
- **Look at timing.** The download has the time each unit was first answered
  and last changed. Implausibly fast coders show up as tiny gaps between
  units.

## Crowd coding

Crowd coding (Benoit et al. 2016; Lind, Gruber and Boomgaarden 2017) trades
trained experts for many untrained coders, whose judgements are combined.

- **Simple tasks.** One or two questions per unit, with options anyone can
  understand. Hard distinctions don't become easier with more coders.
- **Several coders per unit.** Let each unit be coded until three or five
  coders did, or until enough of them agree, with a
  [shared queue](shared-queues.md). Combine them afterwards, for example by
  majority. Keep the individual answers: they let you estimate uncertainty
  per unit.
- **Gold units.** Units with a known answer, coded by everyone (an
  overlap set, see [Gold units](overlap.md#gold-units)), let you compare
  coders with experts. AnnoTinder
  doesn't score them for you: compare them in your analysis.
- **Attention checks and screening.** A question with an obvious answer plus
  a condition and an [end item](end-items.md) screens out coders who don't
  read. See [Online panels and crowd coding](online-panels.md).

## Coders on phones

Many crowd coders and survey participants use a phone. AnnoTinder lays out
every question for the smallest phones (see
[The same form on every device](design-fixed-layouts.md)), but the task must
fit too:

- Long texts are tiring to read on a phone. Shorten units where you can, or
  recruit for desktop if the material needs it.
- Fast yes/no judgements work well as a [swipe](swipe.md).
- Span selection on a touch screen is fiddly. Test it on a real phone first.
- Use the phone sizes in **Preview** to check every question.

## What AnnoTinder doesn't do

- It doesn't compute agreement or combine coders' answers: that is part of
  your analysis.
- It has no adjudication step in which a supervisor resolves disagreements.
  You can make one: a second job (or loop) in which an expert codes the units
  coders disagreed on.
- It doesn't score coders against gold units, or exclude them automatically
  for low agreement.
- It doesn't set time limits per unit or per session.

## Further reading

- Krippendorff, K. (2018). *Content Analysis: An Introduction to Its
  Methodology* (4th ed.). Sage.
- Neuendorf, K. A. (2017). *The Content Analysis Guidebook* (2nd ed.). Sage.
- Benoit, K., Conway, D., Lauderdale, B. E., Laver, M., & Mikhaylov, S.
  (2016). Crowd-sourced text analysis. *American Political Science Review*,
  110(2), 278-295.
- Lind, F., Gruber, M., & Boomgaarden, H. G. (2017). Content analysis by the
  crowd. *Communication Methods and Measures*, 11(3), 191-209.
