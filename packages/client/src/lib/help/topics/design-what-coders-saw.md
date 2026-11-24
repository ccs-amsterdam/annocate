---
title: Keeping track of what coders saw
section: Design notes
order: 4
summary: Design versions, unit versions and answers that are never silently rewritten - so every answer can be read against what its coder saw.
---

An answer only means something with the question and material it answers.
The principle: **nothing a coder saw is changed afterwards**. A change
makes a new version; earlier answers keep pointing to the old one.

## Design versions are frozen when deployed

A deployed version is read only. To change the design, edit a new draft
and deploy it; old versions stay under **Versions**. Every answer records
its design version, so a reworded question stays traceable. See
[Preview, save and deploy](previewing-and-publishing.md).

## Unit versions

Replacing a coded unit (same id, with the extra tick) and deploying makes
a new **unit version** for later coders; earlier answers keep theirs. This
matters for [spans](span.md), whose positions refer to the text they were
made on. Unit edits make no version until deployed; deleting a unit with
answers keeps its versions for those answers.

## Answers are not rewritten

A new design version leaves given answers as they are: a removed question's
answers stay (tagged with their version), changed option values keep the
old value (see [Values and labels](design-values-and-labels.md)), a renamed
question is removed plus new. A coder changing their own answer replaces
it (with first and last time kept). **Reset** answers are marked, not
deleted (see [Resetting answers](changing-a-live-design.md#resetting-answers)).

## When a unit is finished

When every question of its loop in the _current_ version is answered or
skipped. So adding a question reopens finished units: coders get them back
first and answer only the new question. Your data stays complete, at the
cost of coders' time. See
[Changing a design while coding runs](changing-a-live-design.md).

## In your download

| File                                 | Records                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| `annotations.csv`                    | `unit_version_id`, `design_version`, `first_answer`, `last_change`  |
| `units.csv`                          | each unit version with answers; join on `unit_version_id`           |
| `variables.csv`                      | each version's questions, options, labels; join on `design_version` |
| `designs/v<n>.json`                  | each design version whole, with the AnnoTinder release              |
| `devices.csv`, `display_changes.csv` | each coder's devices, keys, screen width and theme                  |

`_label` columns show what the coder saw. See
[Downloading results](results.md).

## What isn't recorded

- **Previews**.
- **A screenshot**: the data, layout and display are stored, but text
  wrapping and fonts differ per device.
- **Earlier answers a coder changed** themselves: only the latest.
- **Images** are stored as URLs: use URLs that don't change.
