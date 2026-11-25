# Unit sets: one column per role (plan)

Decided with the project lead (2026-11-23). Replaces free-form set columns
(any column could be a coder distribution, a crowd's link sets, an
experiment's units or a loop's subset) and the reserved set values
`_overlap`, `_practice`, `_gold`. Pre-release: no conversion code, no
compatibility; examples, tests and docs move to the new format.

## Unit columns with a fixed name and meaning

| Column          | Values                                         | Per unit | Used by                                   |
| --------------- | ---------------------------------------------- | -------- | ----------------------------------------- |
| `coder_set`     | the ids of the study's expert coders (`anna;bob`; only coders there are: `coder-identity.md` §2) | several  | expert coders only                      |
| `condition_set` | an experiment's conditions                     | several  | the experiment that selects units         |
| `part_set`      | parts of the study, e.g. `pre`, `post`         | several  | a unit loop shows one part                |
| `test_set`     | `overlap`, `practice` or `gold` (empty: a coding unit) | one | the loops' placement and checks of test units |
| `answer_<q>`    | the right answer to question `q` (alternatives `a\|b`, ranges `3..5`) | – | practice and gold checks |
| `feedback_<q>`  | feedback on question `q`, shown on practice units | –     | practice checks                           |

- The `*_set` columns are set columns (`;`-separated values, as now).
  `test_set` is a column of its own type ("unit type"): one value of
  `overlap | practice | gold`, or empty. No underscores in values any more.
- These names are reserved: a column with such a name is that role's
  column (uploads, the Units page, validation). Any other column is data.
- `answer_*` / `feedback_*` replace `<q>_gold`, `<q>_practice` and
  `<q>_practice_message`: one answer column per question for practice and
  gold alike (a unit has one test type, which says how the answer is used:
  feedback and a retry on practice units, a silent check on gold units).
  They are text (alternatives, ranges), and must never be shown to coders
  (validation error, as now). Deploy warnings as now (test units without a
  right answer for a checked question; answers that can never be right).
- Overlap units: coded by everyone (expert coders) / by every coder in a
  crowd that divides its units.

## Study modes (the Study entry's `invite`)

- `coders` — **Expert coders**: who codes which units is `coder_set`
  (the `column` field goes; its absence-handling from 88bcfdc becomes "the
  units have no coder_set column yet"). Links: a link per coder, pick a
  name, or sign in — as now.
- `crowd` — **Crowd (one link)** (UI name; also for surveys and survey
  experiments): coder id from a URL parameter, optional sign-in,
  `maxCoders`. The crowd's `column`, the link per set, `groupMaxCoders` and
  `$session.group` go.
- No separate survey or experiment mode: a survey is a study without a
  unit loop; an experiment is an item. (The setup wizard can still offer
  presets.)

## Experiments

- The item stays (`type: "experiment"`): where it sits is when the
  condition is assigned (screened-out coders don't count; balancing within
  earlier answers works).
- `variable.draw`: `random` | `balanced` | `url_param` (new: the condition
  is a URL parameter's value: `param: <a URL parameter's name>`; the
  parameter's values must be the conditions; nothing is drawn).
- `variable.units` becomes a boolean: `true` = each condition gets its own
  units, from `condition_set` (its values are then the conditions;
  `options` optional, as now with a linked column). At most one experiment
  selects units (validation).
- No conditions with expert coders (validation: an experiment that
  selects units needs a crowd).

## Unit loops

- `units.part?: string` replaces `units.subset` (`{column, sets}`): the
  loop shows the units of that part of `part_set` (absent: all parts / no
  filter). One part per loop. Editor: no `part_set` column yet → offer to
  make one (the existing make-column tooling); else a dropdown of its
  values.
- Placement of test units (`overlap`, `practice`, `gold`: ignore / before /
  after / spread) and the checks (`practiceCheck`, `goldCheck` with health)
  stay, reading `test_set`, `answer_<q>`, `feedback_<q>`.
- `divide` (crowd only), `sameAsPrevious`, `coding`, order: unchanged.

## Validation and warnings

- Errors: an experiment selecting units with expert coders; more than
  one experiment selecting units; answer columns shown to coders; a loop
  part with `divide`… (whatever the current rules become with the new
  names).
- Warnings (deploy, where the units are known; design-time where not):
  - a value of `part_set` that no loop shows ("part 'post' isn't shown by any loop");
  - a loop's part that `part_set` doesn't have;
  - units in no set and not test units, that no loop can give anyone
    ("12 units are in no coder, condition or part set and aren't test
    units: no coder gets them") — only where sets apply (e.g. specific
    coders: units without a `coder_set` value and not overlap units; an
    experiment selecting units: units without a `condition_set` value; a
    `part_set` column: units without a part when every loop has one);
  - existing ones (test units without right answers, …).

## Units page and the coder set dialog

- The Units page shows the role columns with their meaning (labels:
  "Coder set", "Condition set", "Part set", "Test set").
- The coder set dialog (making or updating `coder_set`):
  - takes its coders from a checklist of the study's expert coders ("Select
    coders"), who are added under "Manage coders" or on the Coders page;
  - keeps an existing `test_set` column by default;
  - no percentages for generating test units any more;
  - shows the current test units (counts per type) disabled, editable only
    with "Redistribute test units" switched on.
- The make-column tooling makes `condition_set` / `part_set` too.

## Later (not now)

- Waves: a `wave` item (top level) with the number of waves and their
  settings (open from/until), and a `wave_set` column. `part_set` stays the
  within-session split.

## Settled in the implementation (contracts and server)

- `test_set` is stored like the set columns (per value its units:
  `overlap`, `practice`, `gold`), with field type `unit_type`; a unit has
  one value at most; positions (`practice#2`) give practice units an order.
  The role columns' types follow from their names (`UnitsSpecSchema`);
  `PUT /study/:id/sets/:group` takes only them; an upload can't give them
  as data.
- Test units are everyone's: `coder_set` and `condition_set` don't select
  them. A test unit with a part (`part_set`) is only in the loops of that
  part; without one, in every loop.
- `draw: "url_param"`: `param` names a URL parameter of the Study entry (its
  `name`, i.e. `$session.<param>`), which must list `values`; with `options`
  they must be the same values (validation); with `units` and no options,
  `condition_set` must have them (deploy error), and its other values are a
  warning. The value is taken when the experiment is reached; weights and
  `stratify` don't apply.
- Every `$unit.answer_*` / `$unit.feedback_*` in a loop is an error, checked
  question or not (they'd be sent with every unit).
- Deploy errors: expert coders without `coder_set` values; an experiment
  that selects units without `condition_set`, or with listed conditions it
  has no units for. A part no loop shows is a warning only when every loop
  has a part (a loop without one shows them all); "units no coder gets"
  counts, of the units that aren't test units, those without a coder
  (expert coders), a condition (an experiment that selects units) or a
  part some loop shows (every loop has a part), in one message.
- `distributeUnits` (coder set dialog): `testUnits` (existing test units,
  left out) and `newTestUnits` (counts per type, drawn now); it returns the
  coders' sets and the drawn test units. `splitIntoSets` has no overlap any
  more (for `condition_set` / `part_set`).
- Kept names: the recipe's `sets[].group`, the endpoints' `/sets/:group` and
  `?group=` of the units page now name a role column.

## Changed after review (2026-11-23)

- `test_unit` is now `test_set` (label "Test set"), like the other `*_set`
  columns: a unit is in at most one test set. Its field type stays
  `unit_type`; the constants are `TEST_SET`, `TEST_SET_TYPES`.
- `$unit.test_set` is built in, like `$unit.id`: the unit's test set
  (`practice`, `overlap`, `gold`; null for a coding unit). Validation and
  the editor's completions know it; the server sends it when the design
  uses it, and always with practice units (instructions open on them).
  `$unit._practice` and the `_`-name reservation for fields are gone.
- Field usage (Units › Details): the test set is used by every unit loop.
- The Units page: role columns tinted, headed by their label; "Create
  special set…" opens the coder set dialog, the split into a condition or
  part set, or a test set form (counts per type, drawn at random, practice
  units ordered). An existing column is overwritten after asking, or (not
  the test set) "Assign units without a value, keep the rest": units with
  no value that aren't test units get one (coders: `distributeUnits`
  keeping the coders' units; condition and part sets: `addToSets`).
