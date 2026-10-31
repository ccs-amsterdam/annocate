# Plan: special sets (overlap rate, gold, practice)

Status: agreed 2026-10-31, being built in this order: (0) the coder
codebook (done), (1) practice and gold (done: placements `first`, `last`,
`spread`; the rate comes with step 5; coders continue after a wrong
practice answer), (2) "Create gold values", (3) help,
(4) wizard step, (5) overlap at a rate and per-value URL lists. Builds on
`sets-and-session-parameters.md` (set groups, `_overlap`) and replaces the
loop-level checks in `gold-checks.md` (its server-side evaluation and
hidden fields stay).

## 0. The coder codebook

Coders get a **coder codebook** (contracts `CoderCodebook`), not the
codebook: only what the coding client needs. Unit loops keep their layout,
questions, order and, per branch, only its `when` condition (the client
evaluates it and sends the branch index; the server works out the units).
No modes, sets, groups, overlap, practice or gold settings, no Session item,
and `auto` questions without source, weights or stratification. The coding
client compiles against this type, so it can't come to depend on a stripped
field. Branch conditions stay in the client (decided): only people looking
behind the scenes see them, and evaluating them on the server would mean
QuickJS there; this can be hardened later.

## 1. Overlap at a rate

Today the overlap is placed `first`, `last` or `spread`. Spread needs to
know how many units a coder gets, so in crowd coding (a shared queue) it
needs `maxUnits`. A **rate** works without it:

```json
"overlap": { "placement": "rate", "every": 10, "rest": "end" }
```

- `every`: about one in `every` units is an overlap unit. Randomized per
  coder (seeded by coder and loop, so a reload gives the same sequence):
  after each own unit the chance is 1/`every`, with a cap so the gap is
  never more than 2 × `every`. Coders can't predict which unit is compared.
- `rest`: what happens to overlap units the coder hasn't had when their own
  units run out (or `maxUnits` is reached): `end` (they come at the end:
  everyone codes the whole overlap) or `drop` (a coder codes the overlap
  units they happened to get; the overlap is then covered unevenly).
- **The default for crowd coding** (`shared` with a set):
  `{ placement: "rate", every: 10, rest: "end" }`. For `assign`, `spread`
  stays the default (the number of units is known).
- Status per coder ("overlap: 4 of 20 done") in the Coders tab, as for
  spread.

## 2. Special sets

Set names starting with `_` are reserved. Three, all per group:

| Set | What its units are | Coders see |
| --- | --- | --- |
| `_overlap` | coded by every coder of the group (reliability) | nothing special |
| `_gold` | have a known answer: coders are checked silently | nothing special |
| `_practice` | have a known answer: coders are told when they are wrong | feedback after answering |

**Name:** `_practice` (decided): practice units, placed first by default
or spread through the work as an attention check with feedback.

**Answer columns by name** (decided): the right answer to question `q` is
in the unit column `q_gold` (gold) or `q_practice` (practice, optional),
and a practice unit's own feedback in `q_practice_message` (optional).
These columns are never served to coders. An explicit mapping can come
later as an advanced option.

**Instructions** (decided): a setting on every question, when its
instruction shows: always (default), only the first time the coder sees
the question, or only on practice units.

A unit can be in one special set of a group at most (validation on upload
and `putSetGroup`): a gold unit that is also overlap would be compared
twice, and a practice unit tells the coder the answer.

### Loop settings

Like the overlap, per branch (`assign`, and `shared` with a set), each
optional, with `placement` (`first`, `spread`, `rate`, as above) and
optional `max` / `pick`:

```json
"practice": {
  "placement": "first",
  "answers": { "sentiment": "true_sentiment" },
  "message": "$unit.explanation"
},
"gold": {
  "placement": "rate", "every": 20,
  "answers": { "sentiment": "gold_sentiment" },
  "health": { "start": 5, "wrong": -1, "right": 0.5, "end": "low_quality" }
}
```

- `answers`: per question of the loop, the unit column with the right
  answer (an option value; several values `a;b` for multiple choice). For
  **gold**: required, at least one question. For **practice**: optional
  (without answers, practice units are just extra units placed first).
- `message` (practice): shown when an answer is wrong: text, which may use
  `$unit.<column>` for a message per unit (e.g. an explanation column), and
  `$var.<question>` for the coder's answer. Default: "The expected answer
  was …" with the option's label. The coder then continues (or, an option
  to decide: must answer again until right).
- `health` (gold): a score that starts at `start` and changes per checked
  gold unit (`wrong` per wrong answer, `right` per right one, capped at
  `start`). At or below 0 the session ends at the end item `end` (an `end`
  item with outcome `screenout`, its message and redirect apply).
  Alternative wording "penalty" (counts up to a maximum): the same thing
  from the other side; health reads better in the UI ("3 of 5 left").
- Placement default: practice `first` (a practice round), gold `rate`.

### Where answers are checked

On the server, when a unit is submitted (as in `gold-checks.md` §2), never
in the browser:

- **Answer columns are never served.** They are not `shownUnitFields`;
  validation errors when an answer column is also used in a template, a
  question text, a condition or an end message.
- Practice: the submit response says right or wrong, with the message
  (rendered on the server from the unit's columns). Only after answering.
- Gold: the submit response says nothing about right or wrong; only when
  health runs out does it name the end item. Health is rebuilt from
  answers and unit columns (nothing new stored), and per coder in the
  Coders tab and `coders.csv` (`gold_checked`, `gold_wrong`, `health`).

### Validation (publish warnings, like the overlap's)

- The loop has `practice` or `gold`, but the group has no `_practice` /
  `_gold` units.
- A gold unit with an empty answer column for a checked question (per
  unit, with the units listed); a practice unit likewise, if `answers` is
  set.
- An answer value that is not an option of the question.
- The `end` item exists and is a screen-out.

## 3. In conditions and texts

A layout or question text may want to say "This is a practice unit". But
coders must never learn which units are gold, and preferably not which are
overlap (they would take extra care with them). So only practice is
visible:

- **`$unit._practice`**: true for a practice unit (the only special-set
  flag a coder's browser gets). E.g. `::: if $unit._practice` in a layout,
  or in a question's instruction.
- Field names starting with `_` become reserved for such values (uploads
  refuse them), so they never clash with the researcher's columns.
- Gold and overlap are deliberately not available: the server serves those
  units like any other.

## 4. More (agreed)

- **Editor warnings**: a gold or practice question whose column is empty
  for a `_gold` / `_practice` unit, with a link **Create gold values**: an
  answer-key mode that goes through those units with the question forms and
  writes the answers (and practice messages) into the unit columns.
- **Wizard**: an optional step: which unit questions get gold or practice
  checks, and whether the answer column exists yet.
- **Help**: one topic on overlap, gold and practice units, each starting
  with "write it in your units (a sets column), or let AnnoTinder make it".
- **Links** (decided): link parameters keep a stored link per combination.
  URL parameters with a list or a group's sets get "list a link per value"
  (built in the browser, no stored links).

## 5. Order of work (original)

1. Overlap `rate` and `rest` (distribution only; default for crowd coding).
2. Reserved set validation (one special set per unit; `_` field names).
3. Practice: settings, placement, submit response with feedback, editor,
   `$unit._practice`.
4. Gold: hidden answer columns, server-side checks, health and the
   screen-out, Coders tab and export.
5. Help topics (overlap, a new "Practice and gold units" topic), docs.

## 5. Open points

- Practice: continue after a wrong answer, or answer again until right?
- Gold: health only, or also a simple share rule (`gold-checks.md` §3:
  `minChecks`, `minShare`)? Health covers it in most cases.
- Spans in gold or practice: need a tolerance (overlap of offsets). Leave
  out at first.
