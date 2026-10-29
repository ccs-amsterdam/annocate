# Plan: example jobs (and later templates)

Status: §1–§5 built (2026-10-30): `packages/server/examples/<id>.json`
(one file per example, units inline), `src/examples.ts` (loader),
`GET /examples`, `POST /job/from-example`, the "From an example" dialog and
the overview note. Not built: "Actors and their stance" (§2, needs a
feature) and templates and a library (§6).

## Goal

AnnoTinder aims to make survey, experiment and annotation flows
**reproducible and shareable**: a codebook with its settings (distribution,
units it expects, invitations) is a self-contained recipe that someone else
can run again, adapt, and cite. Example jobs are the first step: recipes
shipped with AnnoTinder. Templates (§6) let researchers make their own.

## 1. What an example is

An example creates an ordinary job for the researcher who chooses it: theirs
to try, edit and break without harming anything. Nothing about the job is
special afterwards; it is a starting point, like a template.

An example consists of:

- a codebook (JSON, the same shape the editor shows);
- units, with their fields (a CSV or JSON file), and unitsets (by name, or a
  split: parts plus an overlap set, as `splitUnits` does);
- invitations (e.g. one open link);
- optionally **example answers**: coders and their annotations, so the
  researcher sees what results look like before anyone codes (and, later,
  intercoder reliability on the overlap);
- a title, a category, a short description of what it shows, and what to
  try (e.g. "open the invite link in a private window").

Unitsets in an example must each show something: a set that holds every
unit is the same as "All units" (the default) and only confuses. The current
demo has one (`main`); the example made from it drops it.

Examples live as files in the repository (`packages/server/examples/<id>/`),
reviewed and versioned with the code. Units are texts written for the
examples, so there are no copyright questions.

## 2. Catalogue

What can be built with what exists now, and what waits for a feature:

| Category | Example | Shows | Needs |
| --- | --- | --- | --- |
| Simple annotation | Sentiment by swiping | a swipe question; 20 units split over 3 coders with 5 overlap units; example answers | (results view, reliability: later) |
| Simple annotation | Actor labeling | span annotation | – |
| Simple annotation | Actors and their stance | label actors, then a stance question per labeled actor | a way to ask questions per span (e.g. a loop over a question's values) |
| Surveys and experiments | Simple survey | coder-level questions, conditions (branching), an end item | – |
| Surveys and experiments | Simple experiment | an `auto` variable assigning a condition, conditional texts | – |
| Surveys and experiments | Survey with annotations | survey questions, then a unit loop | – |
| Surveys and experiments | Experiment with annotations | the condition changes the unit layout or questions; routing to unitsets | – (the current demo tour) |

"Actors and their stance" waits for its feature; the rest can be built now.
The current demo tour (`server/src/seed.ts`) becomes the "Experiment with
annotations" example.

## 3. Example answers

Generated when the job is created: a few coders (labelled "Example coder
1..n", so they are recognisable in the coders list) with answers, written as
if they had coded. The answers come with the example (fixed, so results are
the same every time), with deliberate disagreement on some overlap units.
When the researcher adopts the job for real use, they remove them with the
existing annotation reset, or delete the example coders.

## 4. In the researcher UI

- The job list gets "New job from an example": a dialog with the categories
  and examples (title, what it shows), and a name for the job.
- The new job's overview says which example it came from and what to try,
  until the researcher dismisses it.
- Development servers keep creating the demo tour on an empty database, now
  through the same code.

## 5. API

- `GET /examples`: the catalogue (id, category, title, description).
- `POST /job/from-example` (`{ example, name? }`): creates the job, its
  units, unitsets, invitation, codebook (published, so it can be tried right
  away) and example answers; returns the job. The job records the example it
  came from (`origin`).

## 6. Later: templates and a library

- **Templates**: a researcher saves a job as a template: the codebook and
  settings, plus the **unit fields** the codebook needs (name, type,
  description), without the units themselves. Creating a job from it asks
  for a CSV and to match its columns to those fields. Examples are then
  templates that ship with units.
- **Library**: templates shared between researchers and linked to
  literature (the publications that used or introduced them), so a coding
  scheme or experiment can be found, reused and cited.

## 7. Order of work

1. The example format and loader; the demo tour as the first example.
2. `GET /examples`, `POST /job/from-example`; example answers.
3. The "from an example" dialog and the overview notice.
4. The other examples of §2 that need no new feature.
