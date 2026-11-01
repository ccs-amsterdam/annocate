# Plan: the design as the source of truth

Status: agreed 2026-11-01; to build after special-sets step 2 ("Create gold
values"). Migrations are reset before release, so no legacy handling.

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

**Versions.** The field specification describes stored data, which all of
the design's versions share. So it is not drafted and published like the
rest: a change (from an upload or the editor) applies to the job at once,
and every version shows the current fields. Publishing checks the
codebook's use of fields against it. (To confirm.)

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

## 5. Sharing designs (later)

Export a design with its field specification. If it declares fields the
design doesn't use: "Include them? Yes / No / Choose". Importing a design
into a new job shows what the units need before any are uploaded.
