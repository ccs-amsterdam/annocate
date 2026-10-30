---
title: Guided setup
section: Getting started
order: 2.5
summary: Setting up a job quickly - what the guided setup asks, what it makes, and what only the codebook editor does.
---

**Guided setup** (on the **Jobs** page, under **Create new job**) is the
quick way to a working job. It asks a few questions, makes the job, and
opens it in the codebook editor. From then on the job is like any other:
everything it made can be changed in the editor, and the editor can do
much more (below).

## What it asks

1. **What do you want to do?** The job's name, and one or more of:
   **Annotate units** (coders get units one by one), **Ask questions** (a
   survey: questions asked once), **Experiment** (participants get a
   condition). An experiment alone is set up as questions with an
   experiment.
2. **The experiment**: the name of the condition, the conditions, and
   whether they are assigned balanced or at random (an
   [assigned variable](auto.md)).
3. **Units**: the CSV file, as in [Uploading units](uploading-units.md), or
   none yet.
4. **Who codes what**: [everyone codes everything](unit-distribution.md),
   [assign sets](unitsets.md) (by a number of sets or a column, by one link
   or a link per set), [crowd coding](shared-queues.md) (until a number of
   coders coded a unit), experimental groups (a set of units per condition),
   or **decide later** in the editor. Optionally with an
   [overlap](overlap.md) every coder codes.
5. **How coders see a unit**: which field is the title, the byline and the
   body, with a preview of the first unit (see
   [Layout templates](layout-templates.md)).
6. **Questions**: their names, one per line; before the units, about each
   unit, and after the units.

It then makes the units, their [sets](unitsets.md) (a group `sets`), and a
draft codebook, and opens the editor. Publishing the codebook makes its
links: an open link, or a link per set.

## What to do next

The questions have names but no answer type yet: the editor marks them
**to specify**. Select each one, choose its answer type (see
[Choosing a question type](question-types.md)) and fill in the question.
Then save, [preview and publish](previewing-and-publishing.md).

## What only the editor does

The guided setup leaves these out to stay short. Add them in the editor
afterwards:

| What | Where to read about it |
| --- | --- |
| Answer types, options, scales, text selection | [Choosing a question type](question-types.md) |
| Questions asked only in some cases | [Conditions](conditions.md) |
| Screening participants out, ending early, sending them back to a panel | [Ending a session](end-items.md) |
| Crowd coding until coders agree on a question; units per coder; priority | [Shared queues](shared-queues.md#when-a-unit-is-done) |
| Different units for coders by an earlier answer | [Different units for different coders](coder-groups.md) |
| Where the overlap comes (before, after, spread) | [Overlap](overlap.md#placement) |
| A condition per link, or from a URL parameter | [Session parameters](session-parameters.md) |
| Login, participant ids, max uses | [Links](invitations.md) |
| Prolific and other online panels | [Online panels and crowd coding](online-panels.md) |
| Layouts beyond a title, byline and body: styles, blocks, conditions, HTML | [Layout templates](layout-templates.md), [Showing parts conditionally](template-blocks.md), [HTML in a layout](html.md) |
| Reusable pieces of a layout | [Snippets](snippets.md) |
| More than one unit loop | [Unit loops](unit-loops.md) |
