# Plan: a setup wizard for new jobs

Status: proposal (2026-10-30), nothing built. Decisions marked **(to
decide)** are open.

## Goal

The codebook editor is flexible, and therefore complex: a new researcher
faces a tree of items, unit loops, branches, layouts and distribution modes
before they have coded anything. The wizard is a short, guided way to a
first working job for the common cases: "I want coders to label these
texts", "I want a short survey", "I want a survey and then some
annotation".

The wizard **only writes what the editor writes**: units, unitsets, a
codebook, invitations, job settings. When it finishes, the researcher is in
the normal editor with an ordinary job, and from then on works there. There
is no wizard mode, no wizard-only data, and no way back into the wizard for
an existing job (a new job can always start one). That keeps one model of a
job, and the editor stays the place where everything can be changed.

## 1. Where it starts

On the **Jobs** page, **Create new job** opens a choice:

- **Guided setup** (the wizard), recommended for a first job;
- **From an example** (the existing dialog, `examples.md`);
- **Empty job** (what Create new job does now).

Later, **From a template** (`examples.md` §6) joins them.

## 2. The steps

One screen per step, with Back and Next, a progress bar with the step
names, and the job's name in the first step. Each step shows what it will
make in plain words ("Each text is coded by 2 coders"). Nothing is saved
until the last step (**to decide**: or save a draft job after step 1, so a
reload doesn't lose the work; a draft job would then need a "this job is
being set up" state in the job list. Recommendation: keep it in the
browser's local backup, as the editor already does for unsaved changes,
and only create the job at the end).

### Step 1: What do you want to do?

Three cards:

- **Annotate texts or other units**: coders get units one by one and
  answer questions about each.
- **A survey or experiment**: participants answer questions once (no
  units).
- **A survey, then annotation**: first questions about the participant,
  then units.

The answer decides which steps follow (the survey-only path skips units
and distribution).

### Step 2: Units (annotation paths)

The existing upload (CSV, id column, column names as fields, preview),
embedded. Then: "Which field holds the text coders read?" (one field,
required) and "Show other fields too?" (checkboxes, e.g. a headline). This
makes the loop's layout template (`# $unit.headline` + `$unit.text`); the
researcher refines it in the editor later.

Skippable ("I'll upload units later"): the loop then shows a placeholder
template, and the overview checklist (§3) says units are missing.

### Step 3: Questions

One or two questions (**to decide**: allow more? Recommendation: two at
most; more is what the editor is for, and a hint says so). For each:

- the question text;
- the answer type, as plain choices with a small picture, mapped to the
  existing types:

  | Choice in the wizard | Type |
  | --- | --- |
  | Pick one of a few options | `nominal` (buttons) |
  | Pick several | `nominal` with `multiple` |
  | A rating (bad ... good) | `ordinal` |
  | A number | `numeric` |
  | Swipe left / right (annotation only) | `annotinder` |
  | Several statements on one scale | `scale` |
  | Select words in the text (annotation only) | `span` |

- the options or labels (an options editor like the item form's, with
  sensible defaults per type: Negative / Neutral / Positive for a rating);
- for spans: the labels.

Basic settings only: required or not (**to decide** whether the wizard
offers "skip" at all), and the layout the type chooses by default. No
conditions, no branches, no snippets: the last step points to where those
live in the editor.

For the survey paths, the same step makes coder-level questions (outside a
loop); for "survey, then annotation", it asks twice: about the participant,
then about each unit.

### Step 4: Who codes what (annotation paths)

The distribution modes, phrased as questions with a picture each, each
mapped to one loop setting:

- **Every coder codes every unit** → `all`.
- **Split the units over coders** → `shared` with `until: { coders: N }`
  and `maxCoders: N`, asking "How many coders per unit?" (1, 2, 3).
- **Fixed parts per coder** → the existing split wizard (`DivideUnits`,
  parts plus an overlap set) and `sets` mode.
- **Each coder an overlap set for reliability** (with the split): the
  overlap, asking how many units.

Defaults: "split, 1 coder per unit"; a line explains when to want 2+
(reliability). Order: as uploaded, or random (`order`).

### Step 5: Invitation

- One open link (default), or personal links per email (`emails`, login
  required), or a link for a panel (participant id from a URL parameter,
  with presets for Prolific and similar; `participantParam`).
- For a panel: an end screen with the panel's return link (an `end` item
  with `redirectUrl`, filled in from the preset).
- The maximum number of coders (`maxUses`), optional.

### Step 6: Check and create

A summary of everything above, in sentences, with a preview of one unit as
coders will see it (the existing preview, with the codebook that will be
made). **Create job** then, in one request (§4):

- creates the job, units and unitsets;
- saves the codebook as a draft (**to decide**: or publish right away.
  Recommendation: a draft, with a clear next step "Preview, then Publish":
  publishing is the moment coders can start, and the researcher should
  take it knowingly);
- creates the invitation;
- opens the job on its **Overview** tab, with the checklist (§3).

## 3. The overview checklist

On the job's Overview tab (every job, not only wizard jobs), until all are
done or the researcher hides it, a checklist of the steps to a running job,
each linking to its tab:

1. Units uploaded (n units).
2. Codebook saved without issues.
3. Previewed (once a preview was opened for the current draft).
4. Published.
5. An invitation exists.
6. Someone started (n coders).

Each item is computed from the job's state, so it is right however the
researcher got there (wizard, example, editor, API). Item 3 needs a little
state (when the last preview was opened, per draft revision); the others
come from existing endpoints (overview, codebooks, deployment, invites).

## 4. API

One endpoint, so the job is made in one transaction:
`POST /job/from-setup` with `{ name, units?, fields, questions,
distribution, invite }`, or the client makes the codebook JSON itself and
calls a generic `POST /job/from-recipe` with `{ name, units, unitsets,
codebook, invites }`. **Recommendation: the second**: the recipe is what an
example file already is (`examples.ts` reads exactly that, minus the
example answers), so examples, the wizard and later templates share one
"make a job from a recipe" path; the wizard is then client-side only (it
builds a recipe), and nothing on the server knows about wizard steps.

## 5. Relation to examples and templates

- **Examples** are finished recipes with units and example answers: for
  learning what AnnoTinder can do.
- **The wizard** builds a recipe from the researcher's answers: for
  starting their own job with their own units.
- **Templates** (`examples.md` §6) are recipes a researcher saved,
  without units: creating a job from one asks for units and to map their
  columns to the template's fields; that is the wizard's step 2 on its own.

So "recipe" becomes the common format: an example is a recipe file with
units and answers; a template is a recipe without units; the wizard writes
one. A possible later step: "Start from this example" in the wizard's
first step (the example's codebook with the researcher's own units).

## 6. Not in the wizard

Conditions, branches, routing by unitset, `auto` variables (experimental
conditions), snippets, HTML layouts, relations, agreement-based queues,
question loops, closing settings. The last step lists what the editor can
add and links to the help topics. **(to decide)** Whether "a simple
experiment" (one `auto` variable with two conditions and a conditional
text) is common enough to be a wizard path; recommendation: not in the
first version, the example covers it.

## 7. Order of work

1. `POST /job/from-recipe`, with `examples.ts` reading examples through it.
2. The overview checklist (useful without the wizard).
3. The wizard: steps 1, 2, 3, 6 for "annotate texts" with `all` and
   `shared`; then the survey paths; then step 4's sets and overlap, and
   step 5's panel presets.
4. An e2e test per path (`packages/e2e`): through the wizard to a coder
   finishing the job.
