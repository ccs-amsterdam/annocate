---
title: What is AnnoTinder?
section: Getting started
order: 1
summary: The main ideas - studies, designs, units, coders - and how they fit together.
---

AnnoTinder is a tool for **annotation and surveys**: coders look at units
(news articles, posts, images) and answer questions about them, or answer
questions on their own, as in a survey or experiment. Every coder gets the
same task on every device, everything they saw and answered is kept, and a
design can be shared so others can repeat the study.

New here? Follow [Your first study](first-study.md).

## The parts of a study

| Part        | What it is                                                                             | Where           |
| ----------- | -------------------------------------------------------------------------------------- | --------------- |
| **Design**  | The questions, how units are shown and handed out, who codes. Versions v1, v2, ...     | Design          |
| **Units**   | The material to code: rows with an id and fields such as `headline` and `text`         | Units           |
| **Sets**    | Columns of the units that say which coder (or condition) gets which units              | Units           |
| **Links**   | The links coders open to start, made when you deploy                                   | Deploy › Links  |
| **Coders**  | Everyone who started, and how far they got                                             | Deploy › Coders |
| **Results** | All answers, as a zip of CSV files                                                     | Results         |

## How a design is built

A design is a list of **blocks**:

- **Questions blocks**: questions asked once per coder (consent,
  background questions, instructions).
- **Unit loops**: questions asked for every unit a coder gets. The loop
  also says how a unit is shown and which units a coder gets. See
  [Unit loops](unit-loops.md).

Inside a block you add **questions** (see
[Question types](question-types.md)), **Show if** conditions (see
[Conditions](conditions.md)) and **end items** (see
[Ending a session](end-items.md)). Above the blocks, **Coder invitations**
say who codes and how they get in, **URL parameters** what a link carries,
and **Display** how the screen looks.

```text
Questions             Instructions (confirm)
Unit loop             every coder gets 100 news articles
  ├ Topic             categories: politics, economy, sports, ...
  ├ Tone              ordered options: negative, neutral, positive
  └ Actors            mark text: the people mentioned
```

## From draft to coders

1. Create a study and upload your units.
2. Write the design. Saved versions are drafts: coders don't see them.
3. **Preview**: code the study yourself; nothing is stored.
4. **Deploy**: coders now get this version, and the links are made.
5. Send coders a link, follow progress, download the results.

You can keep improving the design after deploying; every answer remembers
the version it was given under. See
[Preview, save and deploy](previewing-and-publishing.md).

Most parts of the editor have a **?** button that opens help on that part.
