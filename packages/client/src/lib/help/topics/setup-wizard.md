---
title: Guided setup
section: Getting started
order: 2.5
summary: Setting up a study quickly - what the guided setup asks, what it makes, and what only the codebook editor does.
---

**Guided setup** (on the **Studies** page, under **Create new study**) is the
quick way to a working study. It asks a few questions, makes the study, and
opens it in the codebook editor. From then on the study is like any other:
everything it made can be changed in the editor, and the editor can do
much more (below).

## What it asks

1. **What do you want to do?** The study's name, and one or more of:
   **Annotate units** (coders get units one by one), **Ask questions** (a
   survey: questions asked once), **Experiment** (participants get a
   condition). An experiment alone is set up as questions with an
   experiment.
2. **The experiment**: the name of the condition, the conditions, and
   whether they are assigned balanced or at random (a
   [random condition](random-condition.md)).
3. **Units**: the CSV file, as in [Uploading units](uploading-units.md), or
   none yet.
4. **Who codes what**:
   - **Everyone codes everything**;
   - **Assign sets**: the units are divided into sets (a number of sets, or
     by a column), and either each set gets its own link (the sets are
     your coders: see [Giving each coder their own units](own-units.md)) or
     one link gives each new session the set with the fewest sessions (an
     assigned condition drawn at the start, linked to the sets);
   - **Crowd coding**: a [shared queue](shared-queues.md), until a number of
     coders coded a unit;
   - **Experimental groups**: the experiment's condition is linked to a
     [set column](sets.md), so each condition gets its own units (see
     [Experimental conditions](experimental-conditions.md));
   - **Decide later** in the editor.

   Optionally with an [overlap](overlap.md) every coder codes.
5. **How coders see a unit**: which field is the title, the byline and the
   body, with a preview of the first unit (see
   [Layout templates](layout-templates.md)).
6. **Questions**: their names, one per line; before the units, about each
   unit, and after the units. With assigned sets or crowd coding,
   also which questions about each unit **gold** or **practice** units
   check, and whether your units have the answer columns yet (see
   [Overlap, gold and practice units](special-units.md)). A set column with
   the values `_gold` and `_practice` marks those units.

It then makes the units, their [set column](sets.md) (`sets`, or the
condition's name), and a design draft, and opens the editor. These are all
drafts: deploying them makes the study's links (one link, or a link per
set) and lets coders start.

## What to do next

The questions have names but no answer type yet: the editor marks them
**to specify**. Select each one, choose its answer type (see
[Choosing a question type](question-types.md)) and fill in the question.
Then save, [preview and deploy](previewing-and-publishing.md).

## What only the editor does

The guided setup leaves these out to stay short. Add them in the editor
afterwards:

| What | Where to read about it |
| --- | --- |
| Answer types, options, scales, text selection | [Choosing a question type](question-types.md) |
| Questions asked only in some cases | [Conditions](conditions.md) |
| Screening participants out, ending early, sending them back to a panel | [Ending a session](end-items.md) |
| Crowd coding until coders agree on a question; units per coder; priority | [Shared queues](shared-queues.md#when-a-unit-is-done) |
| Different units for coders by an earlier answer | [Coder groups in a loop](coder-groups.md) |
| Where the overlap comes (before, after, spread) | [Overlap](overlap.md#placement) |
| A condition per link, or from a URL parameter | [Session parameters](session-parameters.md) |
| Login, participant ids, max uses | [Links](links.md) |
| Prolific and other online panels | [Online panels and crowd coding](online-panels.md) |
| Layouts beyond a title, byline and body: styles, blocks, conditions, HTML | [Layout templates](layout-templates.md), [Showing parts conditionally](template-blocks.md), [HTML in a layout](html.md) |
| Reusable pieces of a layout | [Snippets](snippets.md) |
| More than one unit loop | [Unit loops](unit-loops.md) |
