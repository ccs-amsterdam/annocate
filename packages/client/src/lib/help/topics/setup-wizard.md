---
title: Guided setup
section: Getting started
order: 2.5
summary: Setting up a study quickly - what the guided setup asks, what it makes, and what only the design editor does.
---

**Create new study** → **Guided setup** asks a few questions, makes the
study and opens it in the design editor. Everything it makes can be
changed there afterwards.

## What it asks

1. **What do you want to do?** A name, and one or more of **Annotate
   units**, **Ask questions** (a survey) and **Experiment** (coders get a
   condition).
2. **The experiment**: the condition's name, its values, and balanced or
   random assignment. It becomes a [random condition](random-condition.md)
   at the start of the design.
3. **Units**: a CSV file (see [Uploading units](uploading-units.md)), or
   none yet.
4. **Who codes what**:
   - **Everyone codes everything**;
   - **Assign sets**: units divided into sets, one per coder, each with
     their own link (coders `coder_1`, `coder_2`, ... or a column's
     values). See [Giving each coder their own units](own-units.md);
   - **Crowd coding**: units shared until enough coders coded (or agree
     on) each. See [Shared queues](shared-queues.md);
   - **Experimental groups**: each condition gets its own units. See
     [Experimental conditions](experimental-conditions.md).

   Optionally with an [overlap](overlap.md) that every coder codes.

5. **How coders see a unit**: which field is the title, byline and body.
6. **Questions**: their names, one per line: before the units, about each
   unit, and after. With sets or crowd coding, also which questions
   **gold** or **practice** units check (see
   [Overlap, gold and practice units](special-units.md)).

It then makes the units, their [set column](sets.md) and a design draft:
the questions before and after the units around the unit loop.
Deploying makes the links (one, or one per coder).

## What to do next

The questions are marked **to specify**: select each, choose its answer
type (see [Choosing a question type](question-types.md)) and write the
question. Then [preview and deploy](previewing-and-publishing.md).

## What only the editor does

| What                                                      | Read                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Questions asked only in some cases                        | [Conditions](conditions.md)                                                                           |
| Screening out, ending early, returning to a panel         | [Ending a session](end-items.md)                                                                      |
| Agreement rules, units per coder, priority                | [Shared queues](shared-queues.md#when-a-unit-is-done)                                                 |
| Where the overlap comes                                   | [Overlap](overlap.md#placement)                                                                       |
| Coders' names or email addresses instead of `coder_1`     | [Giving each coder their own units](own-units.md)                                                     |
| Values from the link's URL (a wave, a panel's ids)        | [URL parameters](session-parameters.md)                                                               |
| Sign-in, coder ids, max coders                            | [Links](links.md)                                                                                     |
| Prolific and other panels                                 | [Online panels and crowd coding](online-panels.md)                                                    |
| Layouts with styles, conditional parts, HTML, snippets    | [Layout templates](layout-templates.md), [Showing parts conditionally](template-blocks.md)            |
| More than one unit loop                                   | [Unit loops](unit-loops.md)                                                                           |
