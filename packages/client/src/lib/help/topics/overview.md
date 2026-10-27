---
title: What is AnnoTinder?
section: Getting started
order: 1
summary: The main ideas - jobs, codebooks, units, coders - and how they fit together.
---

AnnoTinder is a tool for **annotation**: people (coders) read or look at
units, such as news articles, social media posts or images, and answer
questions about them. Researchers use it for content analysis, for training
and evaluating classifiers, and for survey experiments in which participants
judge material.

It is built for research: the same codebook gives every coder the same task on
every device, everything that coders saw and answered is kept, and a codebook
can be shared so others can repeat the study.

## The parts of a job

Everything belongs to a **job**: one study or coding project. A job has:

| Part | What it is | Where |
| --- | --- | --- |
| **Codebook** | The questions coders answer, in order, and how units are shown and handed out | Codebook tab |
| **Units** | The material to code: rows of data, each with an id and fields such as `headline` and `text` | Units tab |
| **Unitsets** | Named lists of units, for handing out different units to different coders | Units tab |
| **Invitations** | The links coders open to start | Invitations tab |
| **Coders** | Everyone who started, and how far they got | Coders tab |
| **Results** | All answers, as a download | Results tab |

## How a codebook is built

A codebook is a list of **items**, shown to coders one at a time:

- **Questions**, such as *"What is the main topic?"*. Each has a name (its
  column in the results) and an answer type: categories, a number, a scale,
  a swipe, text selection, and more. See [Question types](question-types.md).
- **Unit loops**: a group of questions asked for every unit a coder gets. The
  loop says *which* units a coder gets and *how* a unit is shown. See
  [Unit loops](unit-loops.md).
- **Conditions**: items that are only shown when an earlier answer says so.
  See [Conditions](conditions.md).
- **End items**: end the session early, e.g. when a participant doesn't fit
  the study. See [Ending a session](end-items.md).

Questions outside a loop are asked once per coder (for example consent, or
background questions in a survey experiment). Questions inside a loop are
asked once per unit.

A typical content analysis looks like this:

```text
Instructions          a confirm question ("I confirm")
Unit loop             every coder gets 100 news articles
  ├ Topic             nominal: politics, economy, sports, ...
  ├ Tone              ordinal: negative, neutral, positive
  └ Actors            span: select the people mentioned
Thank you             the end
```

## From draft to coders

1. **Create a job** and upload your units (a CSV file).
2. **Write the codebook** in the codebook editor. Save as often as you like:
   a saved codebook is a draft only you and your co-editors see.
3. **Preview** it: you code as a coder would, with your real units, without
   storing anything.
4. **Publish** the codebook. Coders now get this version.
5. **Invite coders** with a link.
6. **Follow progress** on the Overview and Coders tabs, and **download the
   results** whenever you like.

You can keep improving the codebook after publishing: coders get the new
version once you publish it again, and every answer remembers the version it
was given under. See [Preview, save and publish](previewing-and-publishing.md).

## Where to go next

- [Your first job](first-job.md) walks through these steps.
- [Layout templates](layout-templates.md) explains how units are shown.
- [Handing out units](unit-distribution.md) explains how units are divided
  among coders.
- The **Design notes** explain why AnnoTinder works the way it does, which
  helps when you design your own study.

Most parts of the editor have a small question-mark button that opens the
help on the topic at hand.
