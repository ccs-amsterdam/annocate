# Plan: hidden unit fields and gold checks

Status: proposed, not built (2026-10-28). To decide after the first release.

## Goal

Crowd coding needs a way to check coders against known answers ("gold"
units) and, optionally, stop coders who keep getting them wrong. The known
answers must never reach the coder's browser, or anyone can read them in the
network tab.

Recommendation: worth building, but small. Checks are simple conditions
evaluated **on the server** when a unit is submitted; nothing else changes
about how units are rendered.

## 1. Hidden unit fields

Today a coder gets only the unit fields the codebook uses
(`shownUnitFields`, `architecture.md` §8.4). A field used only by a gold
check is not shown, so it is not served. That is all "hidden" means: no new
field type, no column naming convention.

Validation makes it hard to leak one by accident: a field used in a gold
check that is also used in a template, a question, a condition or an end
message is an error ("gold field `gold_sentiment` would be shown to
coders"). A researcher who wants to show the right answer afterwards uses
feedback (§4), not the field.

## 2. Defining a check

On a unit loop:

```json
"gold": {
  "checks": [
    { "name": "sentiment", "when": "$unit.gold_sentiment", "pass": "$var.sentiment.is($unit.gold_sentiment)" }
  ],
  "rule": { "minChecks": 5, "minShare": 0.7, "end": "low_quality" }
}
```

- `when`: the unit is a gold unit for this check if the field is not empty.
  Gold units are ordinary units in the loop's unitset, mixed in by the
  researcher (a split or `Add to unitset…` puts them anywhere).
- `pass`: a **simple condition** (`condition.ts`), extended so helper
  arguments may be `$unit.<field>` as well as literal values. Simple
  conditions are parsed data, evaluated in plain TypeScript: no QuickJS on
  the server, no per-submit cost worth measuring.
- Only questions inside the loop can be checked; validation checks the
  names and helper arguments as it does for conditions.

Why not full condition scripts: running QuickJS for every submit on the
server costs memory and time, and gold checks are comparisons
("is", "has", "count() >= n"). Why not render templates on the server so
any field could be hidden: it would move the whole rendering path (and
encryption options, `encryption.md`) to the server for one feature.

## 3. Scores and the screen-out rule

- The runtime keeps per coder and check: passed, failed. It can be rebuilt
  from answers and unit fields at load (the "nothing that can't be rebuilt"
  rule, `architecture.md` §3), so nothing new is stored.
- Re-answering a gold unit (going back) replaces its result, as answers do.
- `rule` (optional): once a coder has at least `minChecks` results over all
  checks and the share passed is below `minShare`, the session ends at the
  named end item (an `end` with outcome `screenout`: its message and
  redirect apply). The submit response says so; the client shows the end.
- Researchers see the scores in the Coders tab, and the export's
  `coders.csv` gets `gold_<check>_passed` and `gold_<check>_failed`.

## 4. Later, if asked for

- **Feedback:** after submitting a gold unit, show "the expected answer was
  …" (the submit response carries it; the field is still not served before
  answering). Useful for training rounds.
- **Gold first:** distribution that serves a coder's first n units from the
  gold units, so the rule can act early.
- **Excluding** screened-out coders' answers from shared-queue coverage, so
  their units go to someone else.

## 5. Open points

- Spans: a gold check on span annotations needs a tolerance (overlap, not
  exact offsets). Leave out at first.
- Whether a failed check should count while the codebook changes (a new
  version may change the question). Probably: results count per codebook
  version, like everything else.
