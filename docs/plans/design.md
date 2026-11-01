# Plan: the design as the source of truth

Status: agreed 2026-11-01. Built: §5 (drafts until deployed, unit
storage, the deploy dialog), §3 (unit fields in the design) and §2 (the
session as the design's `session`, next to the items; editors and
validation see it as the first item, contracts `designItems`), and §1's
codebook export (the editor's Export: Markdown of what coders see). Next:
§4 (targets, panel return URLs as deployment settings).
Migrations are reset before release, so no legacy handling.

## 1. Names

- **Design**: one JSON document per job (versioned: drafts, published
  versions) with everything someone repeating the study needs. The job
  page's Design tab already holds it.
- **Codebook**: the part coders see: questions, instructions, layout. It is
  computed from the design (as the coder codebook already is), not a file
  of its own. The Codebook editor stays the editor for it; a "Codebook"
  export (markdown/PDF) gives a paper's appendix without design internals.
- **Deployment**: one run of a design (§4).

A shared study is a design plus its units (or a template CSV).

## 2. Shape

```json
{
  "units":   { "fields": [ { "name": "text", "type": "text" }, ... ] },
  "session": { "params": [...], "targets": {...} },
  "items":   [ questions, loops (with their branches' distribution), conditions, end items ]
}
```

The Session item leaves `items` for the top-level `session`. Distribution
stays in the loop branches (it depends on their conditions).

## 3. Unit fields: one specification, in the design

The design's `units.fields` **is** the job's unit field specification:
there is no second list next to it. Uploading units and choosing column
types writes it; the design editor edits it. So matching fields and types
happens in one place, and fields the codebook doesn't use are kept too
(they can matter for replication).

**Versions**: see §5: the field specification is part of the design and
versioned with it, like everything else.

**Per field, the editor shows** its type, whether units have it (how many
miss it), and how it is used:

| Use | Meaning |
| --- | --- |
| Shown to coders | In a layout (`shownUnitFields`) |
| Sent, not shown | Used in a condition or text the browser evaluates: anyone looking behind the scenes can see it |
| Server only | Answer columns (`q_gold`, `q_practice`, `q_practice_message`), sets columns |
| Not used | Kept as data; never served |

A field that isn't used can be deleted: the field and its data in the
units (with a confirmation; how this meets unit versions that were already
coded is to work out when building).

**Fields the codebook uses but that aren't declared**: a validation issue
with a one-click fix, "Declare `$unit.x`", that guesses the type from the
usage (span question: text; `.gt`: number or date) and lets the researcher
choose.

**Implied requirements** are computed, never declared by hand: the sets
column of each group a loop uses, `_overlap` / `_practice` / `_gold` units,
answer columns of checked questions. Computed facts (usage, implied
columns, what a question depends on) are never stored in the JSON: the
editor shows them next to it, with a "Units this design needs" summary and
a template CSV.

**Uploading** matches the file's columns to the declared fields (the
mapping step). Missing required fields and wrong types are errors; new
columns are added to the specification ("not used yet").

**Renaming** a field offers to rename it in the stored units (same
content). **Changing a type** is checked against the stored units.

## 4. Design and deployment

Test: would someone repeating the study need it?

| Design | Deployment |
| --- | --- |
| Questions, instructions, layout | The actual units |
| Unit fields and implied columns | Invitation secrets |
| Flow: conditions, end items, branches | Allowed emails or domains per link |
| Distribution, overlap, practice, gold, health | Pause, closing dates, keeping sessions open |
| Session and link parameters | Panel return URLs |
| Sample size targets (sessions per link value, coders per set) | Caps that override a target; counts so far |
| Whether a link requires a login | Which login provider |

- **Targets**: how many times a link (value) can be used is sample size,
  so design; a deployment can set a different cap without editing it.
- **Panel return URLs** move out of end items: an end item names a
  deployment setting ("redirect: panel complete URL").

## 5. Everything is a draft until deployed

One rule for researchers: **everything you edit is a draft; coders see
what you deployed; deploying makes changes live.** That covers the design
(codebook, unit fields, distribution) and the units and their sets.

- A **deployed version** is a design version with the units' current
  versions and the deployed sets (storage below). A deploy that changes
  only the design leaves the units as they are.
- Coders on an older version reload (`codebook_changed`), as before.
- Coding reads the deployed units; Preview shows the drafts.
- Uploading units no longer changes a running study; a bar on the job page
  says what isn't deployed yet and opens the deploy dialog.

**Storage** (built; migration 0026). Field values are stored once per job
by content; units have a draft (overwritten freely) and versions made only
by deploys:

```
unit_values          (id, job_id, hash, value)          unique (job_id, hash)
unit_field_names     (id, job_id, name)
units                (id, job_id, external_id, in_draft, coded)
unit_draft           (unit_id, field_id, value_id)
unit_versions        (id, unit_id, from_deploy, to_deploy)   to_deploy NULL: current
unit_version_fields  (version_id, field_id, value_id)
unit_sets            (id, job_id, live, grp, name)      the draft's and the deployed sets
unit_set_members     (set_id, unit_id, position)
```

- A deploy that changes a unit closes its current version and opens a new
  one; a replaced version no answer points to is deleted then, and values
  nothing refers to go too. So draft edits never make versions, and only
  coded content is kept.
- Answers point to the version their coder saw (one deleted in the moment
  of a deploy gives way to the current one).
- Sets have no history: the draft's and the deployed ones.
- Later: an explicit **purge** that blanks a value's content everywhere
  (privacy), with a warning.

**The deploy dialog** lists both parts, each with a checkbox:

- Units: added, changed, removed (with sets);
- Design: the draft's changes (as the editor marks them).

What is left out stays a draft, carried over onto the new version: deploy
units only while a design draft exists, and the units go out as v2 with
v1's design; the draft becomes the draft on v2 (for v3). Versions are
numbered in order and say what changed ("v2: units +500", "v3: codebook").
Deploy validates the combination chosen: coupled changes (a renamed field
in the design and in the units) must go together, and the dialog says so
and ticks both; a draft with errors can't be included. New columns in an
upload are added to the draft's field list as "not used", so deploying
units alone stays possible.

## 6. Sharing designs (later)

Export a design with its field specification. If it declares fields the
design doesn't use: "Include them? Yes / No / Choose". Importing a design
into a new job shows what the units need before any are uploaded.
