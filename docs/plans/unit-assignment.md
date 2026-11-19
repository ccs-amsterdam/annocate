# Plan: assigning units (divide over coders or groups)

Status: proposed 2026-11-19, to be confirmed. Replaces the loop modes
(`all`, `shared`, `assign`) and the set-backed link parameters of
`sets-and-session-parameters.md`; keeps the distribution engine and the
special sets of `special-sets.md`.

## Why

The most common setup, "three links for my three coders, with some overlap",
now takes three linked steps: a set group whose set names are the coders, a
link parameter whose values are that group's sets, and a loop that assigns
the set from that parameter. Researchers don't see how these connect. The
cause is that one idea, *who is this session for*, is spread over the
units, the session and every loop.

## The model

Two questions, each answered in one place:

1. **Who gets which units?** A study-level decision in the design: units
   are *divided* over coders or groups, by a unit column. The units say who
   codes them; the design says which column that is.
2. **How does a loop hand out its units?** Each loop works within the
   session's share: optionally a filter, and optionally distribution
   criteria. Loops don't choose who gets what.

Experimental conditions that don't come from the units (the questions differ,
not the units) stay as they are: a parameter or an `auto` variable, read in
`when` branches.

### 1. Dividing units (study level)

In the design's session settings (the Study entry):

```jsonc
"session": {
  "divide": [
    { "over": "coders", "column": "coder" },
    { "over": "groups", "column": "condition", "assign": "link" }   // or "random"
  ],
  ...
}
```

- **Nothing** (no `divide`): every session has all units.
- **Coders**: the column's values are coders, as names or email addresses.
  Each value gets its own link at deploy. A value that is an email address
  also lets that person continue by logging in (open question 1).
- **Groups**: the column's values are groups: conditions, or e.g. 100 sets
  for a multilevel design. `assign: "link"` makes a link per group;
  `"random"` makes one link that assigns groups at random, balanced (today's
  `draw: balanced`). The session's group is available as
  `$session.<column>`, so the design can say `if $session.condition is
  "experiment"`.
- **Both** (open question 2): a session's share is the units that match both
  its coder and its group.

**The column** is a declared unit field of a new type `set`: each cell holds
one or more values (`a;b`), plus the special values:

| Cell | Meaning |
| --- | --- |
| `anna` | in Anna's share |
| `anna;bob` | in Anna's and Bob's share (overlap between them) |
| `_overlap` | in every share |
| `_gold`, `_practice` | gold or practice units, for every share (as now) |
| empty | in nobody's share: a deploy warning |

Storage is today's: a `set`-typed column is a set group with a set per value
(`unit_sets`, `unit_set_members`, draft and live). Uploads fill it from the
CSV column; the Units page edits it as before.

**Deploy checks** (the design is the source of truth):
- the units have the column the design divides over;
- every value used in a `when` condition on `$session.<column>` occurs in it;
- units without a value (warning), values with very few units (warning);
- the number of links (one per value, times other link parameters) within
  the existing limits.

### 2. Loops

A loop's branch loses its `mode`:

```jsonc
{
  "when": { "script": "$session.condition.is('experiment')" },   // optional, as now
  "filter": { "column": "phase", "only": ["post"] },              // optional
  "criteria": {                                                   // optional
    "codersPerUnit": { "min": 1, "max": 3 },
    "until": { "agree": 2, "on": "sentiment" },
    "unitsPerCoder": { "min": 10, "max": 50 }
  },
  "overlap": { "placement": "spread" },                           // as now
  "practice": { ... }, "gold": { ... }                            // as now
}
```

- **Default** (no filter, no criteria): the session codes all units of its
  share, once.
- **Filter** (for power users): only, or all except, some values of a `set`
  column, e.g. a `phase` column with `pre` and `post` for two loops, or
  "first the `_overlap` units, then the rest".
- **Criteria** turn the loop into a shared queue within the share: coders
  per unit, agreement, units per coder. Crowd coding is no longer a mode:
  it's a loop with criteria in a study that doesn't divide.
- **Special units** keep their placements (first, last, spread, rate), now
  relative to the share.

### 3. Links

Links follow from the design at deploy, as now (`syncLinks` by link key):
one per coder value and/or group value, times other link parameters. The
Links page lists them by value. `maxUses` applies per link.

## What stays, what goes

| Stays | Goes |
| --- | --- |
| The distribution engine: `UnitPool`, `Codings`, `pickNext`, `rateDue`, leases and locks | The loop `mode` (`all`, `shared`, `assign`) and `from` (`draw`, `session`) |
| Special sets and their placements | Link parameters with `values: {sets: group}` |
| Set storage (`unit_sets`) and the Units page | Sets that aren't a declared `set` column (a set group becomes a `set` column) |
| `auto` variables, URL parameters, participant id, `maxUses`, combinations | `SplitIntoSets` / `GenerateSets` as separate flows (they become "fill the column") |
| `when` branches | |

## Implementation steps

1. **Contracts**: the `set` unit field type and its cell syntax;
   `session.divide`; the branch schema (when, filter, criteria, placements);
   validation (column exists, filter columns are `set` columns, `when` values);
   recipes.
2. **Server**: assignment per study instead of per branch fingerprint
   (`coders.assignments` keyed by divide column); routing the share
   (link value, email, or balanced random); pools keyed by share × loop ×
   filter, with the lock names to match; deploy checks and link generation;
   progress and the Coders tab per share. New tests for routing; the engine
   tests stay.
3. **Client**: the Study entry's "Divide units over"; the loop form rewritten
   around filter and criteria; the Units page and upload with the `set`
   column type; the Links page; the setup wizard's distribution step;
   exports (`units.csv` gets the column instead of `sets.<group>`).
4. **Docs and examples**: help topics (sets, overlap, distribution, special
   units, wizard), API docs, the `swipe-sentiment` example, e2e.

No migration of existing designs: there are none in use.

## Open questions

1. **Email values.** Does a link for `anna@uni.nl` require logging in with
   that address, or does the link alone work (and logging in is how she
   continues on another device)?
2. **Coders and groups at once.** Support both in one study from the start,
   or one divide column first?
3. **New values after deploy.** A new coder in the column gets a link at the
   next deploy. Should units already coded by others stay with them (yes,
   proposed), and should a new value take a share of *uncoded* units
   automatically, or only what the column says?
4. **Filters.** Only on `set` columns (proposed), or on any unit field?
