# Plan: a setup wizard for new jobs

Status (2026-10-30): built, §1 to §5. §6 lists possible next steps.

## Goal

The codebook editor is flexible, and therefore complex. A new researcher
faces a tree of items, unit loops, branches, layouts and distribution modes
before they have coded anything. The wizard is a short, guided way to the
skeleton of their job: what it does, which units, who codes what, and which
questions. It asks nothing about the questions themselves: the researcher
names them, and specifies them in the editor.

The wizard **only writes what the editor writes**: units, unitsets, a
draft codebook, an invitation. Then the job opens in the normal editor, and
from then on the researcher works there. There is no wizard mode, no
wizard-only data, and no way back into the wizard for an existing job.

## 1. Recipes

A **recipe** (`contracts/src/recipe.ts`) is everything a new job starts
with:

- units, and unitsets by the units' ids;
- the first codebook, as a draft, or published when it passes validation;
- invitations.

`POST /job/from-recipe` makes a job from one in a single transaction
(`server/src/shared/recipes.ts`), with the same role, limits and ownership
as creating a job. Three things share it:

- **Example jobs** are recipe files with a published codebook, plus their
  catalogue text and example answers (`packages/server/examples/`).
- **The wizard** builds a recipe in the browser
  (`client/src/lib/admin/setupRecipe.ts`). The server knows nothing about
  wizard steps.
- **Templates** (later, `examples.md` §6) would be recipes a researcher
  saved, without units.

## 2. Questions and loops to specify

A question can exist before its answer type: `{ type: "unspecified" }`,
with an optional question text. It saves in a draft. Validation reports
it ("has no answer type yet: choose one"), so the codebook can't be
previewed or published until every question has a type.

In the editor:

- the tree marks the question **to specify**;
- the Answer Type select asks "Choose an answer type...";
- the form explains that the type brings what it needs (options, labels, a
  range).

References to such a question work as for a single answer.

Likewise a unit loop can exist before its units are set (`units: []`):
validation reports it ("Which units coders get isn't set yet"), the tree
marks it *to specify*, and its Units tab asks how units are handed out. In
the editor, a new question starts without an answer type and a new loop
without units: the researcher chooses, rather than inheriting a default
they may not notice (confirm, all units).

## 2b. Layouts as a sketch

A loop's Layout tab starts as a sketch of a document
(`components/admin/LayoutDesigner.tsx`): click a place to put a field
there. Title and byline take one field, the body any number, added and
removed one by one (`client/src/lib/codebook/simpleLayout.ts`).
The form writes an ordinary template (`# $unit.headline`,
`*$unit.source*`, `$unit.text`). A template is shown as the form only if
it has exactly that shape; otherwise it opens in the template editor
(**Advanced**), so nothing written there is lost. "Use the simple form
instead" replaces a template, after asking. Later: more places (an image, a footer), columns, and components such as
mock engagement counts, chosen from a menu.

## 3. The steps

Start the wizard with **Guided setup** on the Jobs page. It sits next to
**From an example** and **Create new job** (an empty job).

1. **What do you want to do?** The job's name, and three toggles:
   **Annotate units**, **Ask questions** (a survey: questions asked once per
   participant), **Experiment**. An experiment alone is set up as a survey
   with an experiment.
2. **The experiment** (with Experiment). The condition variable's name
   (default `condition`), the conditions (default `control`, `treatment`),
   and how they are assigned: balanced (default) or random. This becomes an
   `auto` question, first in the codebook.
3. **Units** (with Annotate). The CSV upload from the Units tab (or skip
   it and upload later; the id column is the type **unit id**), and random
   order per coder, or as uploaded.
4. **Who codes what** (with Annotate), right after the units. A dropdown,
   each option with its own settings (named as in the editor's Units tab):
   - **Everyone codes everything**: no settings (`all`).
   - **Assign sets**: divide the units into N sets, or make one set per
     value of a column. Optionally add overlap units that every coder
     codes, as a number or a percentage, drawn at random and taken out of
     the sets. Coders get a set in one of two ways:
     - one link that gives each new coder the set with the fewest coders
       (`sets`);
     - an invitation link per set (`invitation`), for the classic design
       with a few expert coders.
   - **Crowd coding**: a shared queue, with the editor's own form for it
     (units per coder, coders or agreement per unit, at least and at most,
     priority), and an optional overlap (the queue is then the other units).
     The question coders agree on can only be chosen from questions named
     already (going back), otherwise in the editor.
   - **Experimental groups** (with an experiment): pick a column, and per
     condition which of its values belong to it. This makes a unitset per
     condition (`condition_<value>`), and the loop routes by the condition
     (`condition_$var.condition.value`).
   - **Decide later (advanced)**: the loop is made with no units set
     (`units: []`). It is marked *to specify*, and its Units tab asks to
     choose.

5. **How coders see a unit** (with Annotate): the **layout sketch** (§2b)
   beside a preview of the first unit. Title and byline are guessed from
   field names like `headline` and `source`; the other text fields are the
   body.
6. **Questions.** Names, one per line. A line can be a name (`age`) or the
   question itself (`How old are you?`): the name is made from it
   (`how_old_are_you`) and the line becomes the question text. Where they
   go:
   - **annotation alone**: one list, the questions about each unit;
   - **a survey or experiment alone**: one list, asked once;
   - **annotation with a survey or experiment**: three lists, before the
     units, about each unit, and after the units.
7. **Check and create.** A summary in sentences, what comes next in the
   editor, and what still stops the job (no name, a question twice, no
   question about the units, conditions that don't match the units' field).
   Create makes the job: units, unitsets, the draft codebook, and an open
   invitation link (or one per set). It then opens on the Codebook tab.

## 4. Tests

- `client/src/lib/admin/setupRecipe.test.ts`: the recipes per
  combination. Each parses as a recipe, and its codebook's only issues are
  the questions to specify.
- `server/src/__tests__/examples.test.ts`: `POST /job/from-recipe`. Checks
  the draft, units, unitsets and invitation; that only a valid codebook is
  published; that a bad recipe is refused and leaves nothing; and the limit
  on jobs.
- `e2e/tests/wizard.spec.ts`: three runs through the wizard in a browser:
  annotation with an experiment and experimental groups, ending with a
  question specified in the editor; crowd coding with an overlap and the
  guessed layout; and a survey alone.

## 5. Decisions taken

- No question details in the wizard: only names. The editor
  is where questions are specified, made conditional, and so on.
- `unspecified` is a real answer type, not a missing one, so drafts stay
  valid JSON of a known shape and the editor can show it plainly.
- The codebook is created as a draft: publishing stays a deliberate step
  after previewing.
- One open invitation link is made, or one per set when sets are handed
  out by link. More kinds of links (personal, panel) are in the editor's
  Invitations tab.
- Experimental groups pick their units by a column's values, chosen per
  condition, rather than requiring the values to be the conditions' names.
  Other designs (the same units with different questions or layouts per
  condition) are made in the editor with conditions on `$var.condition`.
- Overlap units are drawn at random with a fixed seed, so the same upload
  gives the same sets.

## 6. Possible next steps

- **Specify questions in the wizard.** An optional step after the names
  loops over the questions with the editor's own question form
  (`ItemForm`), one at a time, with "Skip, do it in the editor". This reuses
  the form as it is, so it should be little work.
- **Parts of the wizard in existing jobs.** These steps work on an existing
  job too, as small "start here" panels where the job is still empty:
  - **Empty codebook:** the Codebook tab could offer the questions step,
    making the loop and questions in the current draft. With the units
    there, its layout comes from the units' text fields.
  - **No units:** the Units tab already has the upload. Missing is the
    distribution choice and the layout's fields, which only make sense
    together with a loop. A loop whose layout shows nothing yet could offer
    "show these fields".

  The general form: the wizard's steps as functions from the job's state
  to changes of it (a recipe applied to an existing job), each offered
  where its part of the job is empty. Not yet obvious how to do this
  without a second way to edit what the editor edits, so not built.
- **An overview checklist** on every job's Overview tab: units uploaded,
  codebook without issues, previewed, published, an invitation, someone
  started. Each item is computed from the job, so it is right however the
  job was made.
- **Templates**: "Save as template" writes a recipe without units; making
  a job from one runs the wizard's units step for the template's fields.
- **More experiment designs**: conditions that change the questions or the
  layout, not the units; offered as choices once it is clear which are
  common.
