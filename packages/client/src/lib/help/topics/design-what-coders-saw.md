---
title: Keeping track of what coders saw
section: Design notes
order: 4
summary: Codebook versions, unit versions and answers that are never silently rewritten - so every answer can be read against what its coder saw.
---

An answer only means something together with the question and the material
it answers. If either changes during a study, you need to know which answers
were given to which version. AnnoTinder records this for every answer, so you
can improve a codebook or fix a unit while coding runs without losing track.

The principle: **nothing a coder saw is changed afterwards**. A change makes
a new version; earlier answers keep pointing to the old one.

## Codebook versions are frozen when published

You edit a codebook as a **draft**. When you publish it, that version becomes
**live** and read only: it can never be changed again. To change the
codebook, you edit a new draft and publish that. Earlier versions stay in the
version history (open **Versions** in the codebook editor), where you can view
them or use **Restore as draft** to continue from one.

Every answer records the codebook version it was given under. So even if you
reword a question halfway through, you can tell which answers were given to
the old wording. See [Preview, save and publish](previewing-and-publishing.md).

## Unit versions

A unit can be replaced after it was coded, for example to fix a broken text:
upload it again with the same id, and tick the box that also replaces the
coded units. Later coders then see the new content.

AnnoTinder keeps both. The first time a unit is shown, the unit *as shown*
is stored as a **unit version**: its id and the fields the codebook uses. Each
answer points to the version its coder saw. Replacing the unit makes a new
version for later coders; earlier answers keep theirs. This matters most for
[spans](span.md): a selected piece of text is stored as a position in the
text, and that position only makes sense in the text it was made on.

A few details:

- Changing a field the codebook doesn't use makes no new version: coders
  didn't see it.
- If the codebook starts using another field, units shown from then on get a
  new version, which includes that field.
- A unit that has answers can't be deleted.

## Answers are not rewritten by a new version

When you publish a new codebook version, answers already given stay as they
are:

- **A removed question**: its answers stay in the database and in the
  download, tagged with the version they were given under. They are only
  no longer asked or shown.
- **A changed option value**: answers with the old value keep it. See
  [Values and labels](design-values-and-labels.md).
- **A renamed question** counts as a removed question plus a new one.

A coder who goes back to an earlier unit and changes an answer replaces their
own previous answer: AnnoTinder keeps their latest answer, with when it was
first given and when it was last changed. The researcher API can also
**reset** answers, for example to have units coded again: reset answers are
not deleted but marked as no longer counting, and scripts can still download
them.

## When a unit is finished

A unit is **finished** for a coder when every question of the loop, in the
*current* codebook, has an answer. Questions a condition hid count as
answered: they are stored as skipped.

Because "finished" follows the current codebook, adding a question to a loop
reopens the units coders already finished. Coders get those units back first,
with their earlier answers, and only answer the new question. The publish
dialog tells you how many finished codings this affects. Removing a question,
or changing conditions or order, leaves finished units finished.

This is a choice with a trade-off: your data stays complete (every finished
unit has an answer to every question), but adding a question to a running job
costs coders time. AnnoTinder can't yet add a question *without* reopening
finished units. See
[Changing a codebook while coding runs](changing-a-live-codebook.md).

## In your download

| File | What it records |
| --- | --- |
| `annotations.csv` | Per unit and coder: `unit_version_id` (what they saw), `codebook_id` (the version), `first_answer` and `last_change`, and the answers |
| `units.csv` | Each unit version that has answers, with the fields as shown. Join on `unit_version_id` |
| `variables.csv` | Each codebook version's questions, options and labels. Join on `codebook_id` |

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
