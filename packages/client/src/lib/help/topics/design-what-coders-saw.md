---
title: Keeping track of what coders saw
section: Design notes
order: 4
summary: Design versions, unit versions and answers that are never silently rewritten - so every answer can be read against what its coder saw.
---

An answer only means something together with the question and the material
it answers. If either changes during a study, you need to know which answers
were given to which version. AnnoTinder records this for every answer, so you
can improve a design or fix a unit while coding runs without losing track.

The principle: **nothing a coder saw is changed afterwards**. A change makes
a new version; earlier answers keep pointing to the old one.

## Design versions are frozen when deployed

You edit a design as a **draft**. When you deploy it, that version becomes
**live** and read only: it can never be changed again. To change the
design, you edit a new draft and deploy that. Earlier versions stay in the
version history (open **Versions** in the codebook editor), where you can view
them or use **Restore as draft** to continue from one.

Every answer records the design version it was given under. So even if you
reword a question halfway through, you can tell which answers were given to
the old wording. See [Preview, save and deploy](previewing-and-publishing.md).

## Unit versions

A unit can be replaced after it was coded, for example to fix a broken text:
upload it again with the same id, and tick the box that also replaces the
coded units. Once you deploy it, later coders see the new content.

AnnoTinder keeps both. Each deploy that adds or changes a unit stores it
as a **unit version**: its id and its fields. Each answer points to the
version its coder saw. Replacing the unit and deploying makes a new
version for later coders; earlier answers keep theirs. This matters most for
[spans](span.md): a selected piece of text is stored as a position in the
text, and that position only makes sense in the text it was made on.

A few details:

- Edits to units are drafts: they make no version until you deploy them.
- A replaced version that no answer points to is not kept.
- Deleting a unit that has answers takes it out of the draft; its versions
  stay for those answers.

## Answers are not rewritten by a new version

When you deploy a new design version, answers already given stay as they
are:

- **A removed question**: its answers stay in the database and in the
  download, tagged with the version they were given under. They are only
  no longer asked or shown.
- **A changed option value**: answers with the old value keep it. See
  [Values and labels](design-values-and-labels.md).
- **A renamed question** counts as a removed question plus a new one.

A coder who goes back to an earlier unit and changes an answer replaces their
own previous answer: AnnoTinder keeps their latest answer, with when it was
first given and when it was last changed. You can also
**reset** answers, for example to have units coded again: reset answers are
not deleted but marked as no longer counting, and you can still download
them (see [Resetting answers](changing-a-live-design.md#resetting-answers)).

## When a unit is finished

A unit is **finished** for a coder when every question of the loop, in the
*current* design version, has an answer. Questions a condition hid count as
answered: they are stored as skipped.

Because "finished" follows the current design version, adding a question to a loop
reopens the units coders already finished. Coders get those units back first,
with their earlier answers, and only answer the new question. After you
deploy, the deploy dialog tells you how many finished codings this
affects. Removing a question,
or changing conditions or order, leaves finished units finished.

This is a choice with a trade-off: your data stays complete (every finished
unit has an answer to every question), but adding a question to a running job
costs coders time. AnnoTinder can't yet add a question *without* reopening
finished units. See
[Changing a design while coding runs](changing-a-live-design.md).

## In your download

| File | What it records |
| --- | --- |
| `annotations.csv` | Per unit and coder: `unit_version_id` (what they saw), `design_version` (the design version: v<n>, as in `designs/v<n>.json`), `first_answer` and `last_change`, and the answers |
| `units.csv` | Each unit version that has answers, with the fields as shown. Join on `unit_version_id` |
| `variables.csv` | Each design version's questions, options and labels. Join on `design_version` |
| `designs/v<n>.json` | Each design version as a whole (questions, layouts, how units were handed out, session, unit fields), with the AnnoTinder release and commit it ran on |

The `_label` columns show the label in the version the answer was given
under, which is what the coder saw. See [Downloading results](results.md).

## What isn't recorded

- **Previews** store nothing: not your test answers, and not the units as you
  saw them.
- **How a unit looked on screen.** AnnoTinder stores the data and the
  layout, not a screenshot: screen size, light or dark mode, and the coder's
  browser can make the same unit look a little different. See
  [The same form on every device](design-fixed-layouts.md).
- **Earlier answers a coder changed themselves.** Only the latest is kept.
- **Images** are stored as their URL. If the image at that URL changes, the
  unit version doesn't notice. Use URLs that don't change.
