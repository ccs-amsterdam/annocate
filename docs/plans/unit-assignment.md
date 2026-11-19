# Plan: assigning units (coders and conditions)

Status: built (2026-11-19, steps 1–4). Deviations from the text below:

- The random condition is a **computed item** (`type: "computed"`,
  `variable: { type: "random", draw, options?, units?, stratify? }`, since
  2026-11-19; first an answer type `random_condition` of a question). The
  editor shows it as "Random condition". Later computed variables can have
  other types (a formula). The coder API draws it at
  `POST /variables/computed/:name`.
- The coder and condition values are per session (`$session`).
- Migration `0006_unit_assignment.sql` has the same number as the MCP
  branch's `0006_oauth.sql`: renumber one when merging.

### Branches removed (2026-11-19)

A loop's `units` was a list of branches, each with a `when` condition (on
coder-level answers, evaluated by the client, which sent the branch index),
its own filter, criteria and special units, and coders' routing was stored
per branch fingerprint so it stuck. It is now **one object**
(`{ filter?, criteria?, overlap?, practice?, gold? }`, absent: all the
session's units, once). Why:

- **Who gets which units is the session's job.** Since this plan, the
  coder column and conditions linked to a column decide a session's units;
  the common reason for branches ("experimental groups get other units") is
  a computed item (or an assigned condition) linked to a column. Branches
  were a second, overlapping way to do the same.
- **The machinery cost more than it gave.** Branch fingerprints, sticky
  routing, `branch_required`, the client's branch choice and a trust
  trade-off (a coder could send another branch index).
- **A branch duplicated a loop without its questions' names**: two groups
  that need other settings get the same questions, so their answers can't be
  told apart, while copying the loop needs other names. That fits better
  with value loops and value branches (`question-loops.md` §5), which also
  describes settings that depend on a condition as the way back for
  per-group settings.

What stays: coders keep the units they coded (they can go back to them and
change their answers, whatever their values or the loop's settings give
them now), and the leases of a shared queue are loop-wide (shares overlap).
`coders.assignments` only marks the loops a coder reached, for progress;
migration `0007_loop_units.sql` resets it.

Replaces the loop modes (`all`,
`shared`, `assign`), set-backed link parameters (`values: {sets: group}`),
`auto` variables as such, and per-link sign-in settings. Keeps the
distribution engine and the special sets of `special-sets.md`.

## Known limitations

- A running session keeps its sign-in state: changing the study's sign-in
  setting applies to new sessions.
- A link's settings are cached by the server (`linkInfo`) for up to 60
  seconds, so a change to links can take that long to apply.
- A session that started from a link without a coder value, before the
  coder column had values, has no units: it gets 409 `not_assigned` ("No
  units are assigned to you yet: ask the researcher for a new link").
- Coders keep the units they coded: a unit that a re-upload moves to
  another coder can still be opened and answered by the coder who coded it
  (the other coder gets it too).

## Why

The most common setup, "three links for my three coders, with some overlap",
took three linked steps: a set group whose set names are the coders, a link
parameter whose values are that group's sets, and a loop that assigns the
set from that parameter. Researchers didn't see how these connect: one idea,
*who is this session for*, was spread over the units, the session and every
loop.

## The model

1. **Coders**: the design can say that units are divided over coders, by a
   coder column in the units.
2. **Conditions**: variables with values (a fixed list, or free), assigned
   per session (at the start, by link or at random) or when reached in the
   flow (random). A condition can be linked to a unit column: its value then
   selects the session's units.
3. **Loops** work within the session's units: an optional filter and optional
   distribution criteria. They don't decide who gets what.

### 1. Coders

In the design (session settings):

```jsonc
"session": { "coders": { "column": "coder" }, ... }
```

- The column is a `set` column in the units (see below); each value is a
  coder.
- **All values are email addresses**: one link, sign-in required; a coder
  gets the units of the address they signed in with.
- **No value is an email address**: one link per coder, no sign-in needed.
- **A mix**: an error at deploy.
- Deployment decides nothing else for coders: the design says the units are
  divided, the values say how people get in.

### 2. Conditions

A condition is a named variable with values:

- **Fixed values**: a list (`control`, `experiment`). The design can use them
  (`$session.framing.is("experiment")`) and they are validated.
- **Free values**: whatever the linked unit column holds, e.g. 100 sets for a
  multilevel design. Only usable when linked to a column.

Two ways to assign one:

- **Assigned condition** (session level, in the session settings). The design
  says how links are made:
  - `per link`: a link per value;
  - `random`: one link, assigned at random or balanced when the session
    starts.
- **Random condition** (an item in the flow; replaces `auto` variables):
  assigned when the coder reaches it, random, balanced or stratified on
  earlier answers, as `auto` variables are now.

Either can be **linked to a unit column**: the session then only gets the
units whose cell holds its value. A loop that depends on a random condition
must come after it in the flow (validated).

```jsonc
"session": {
  "conditions": [
    { "name": "framing", "values": ["control", "experiment"], "assign": "link", "units": "framing" },
    { "name": "set", "values": "free", "assign": "random", "units": "set" }
  ]
}
```

**Cross-nested designs** use separate conditions, each with its own column
(`framing` × `valence`): a session's units are those matching all its linked
conditions and its coder. Separate variables are also cleaner in the export.

### The `set` column

A declared unit field of type `set`. Each cell holds one or more values:

| Cell | Meaning |
| --- | --- |
| `anna` | in Anna's units (or the `anna` condition's) |
| `anna;bob` | in both |
| `_overlap` | for everyone |
| `_gold`, `_practice` | gold or practice units, for everyone (as now) |
| empty | for nobody: a deploy warning |

Storage is today's set storage: a `set` column is a set group with a set per
value (`unit_sets`, `unit_set_members`, draft and live).

### 3. Loops

A loop's `units` has no `mode` (and, since 2026-11-19, no branches):

```jsonc
{
  "filter": { "column": "phase", "only": ["post"] },         // optional: only or except, on a set column
  "criteria": {                                              // optional
    "codersPerUnit": { "min": 1, "max": 3 },
    "until": { "agree": 2, "on": "sentiment" },
    "unitsPerCoder": { "min": 10, "max": 50 }
  },
  "overlap": { ... }, "practice": { ... }, "gold": { ... }   // placements, as now
}
```

- Default: the session codes all its units, once.
- Criteria make the loop a shared queue within the session's units (crowd
  coding).
- Special units keep their placements.

### 4. Deployment settings

- **Sign-in**: required, optional or off, for the whole study (no longer per
  link). Asked in the deploy dialog at the first deploy; changeable later.
  Email coders imply required.
- **Adding coders or units**: nothing changes until the next deploy. Then
  existing assignments stay (coders keep what they coded) and new coders get
  a balanced share of what the column gives them.

### 5. Deploy checks

- Every column the design names exists and is a `set` column.
- Fixed condition values occur in their linked column; values in the column
  that aren't in the list are a warning.
- Coder values are all emails or no emails.
- Units in nobody's share: a warning.
- Link counts within the limits (per value × other link parameters).

## Naming

"Condition" now means an experimental condition. The if-block item in the
design tree is renamed **Show if** (item type `show_if`).

## Implementation steps

1. **Contracts**: `set` field type and cell syntax; `session.coders`,
   `session.conditions`; the random condition item (replacing `auto`); the
   `show_if` item (replacing `condition`); the loop branch (when, filter,
   criteria, placements); validation; recipes; the coder codebook.
2. **Server**: assignment per study (coder and conditions per session, not per
   branch fingerprint); routing (link value, email, random/balanced at start,
   random condition when reached); pools keyed by share × loop × filter;
   deploy checks; links; the sign-in setting; progress, Coders tab, exports.
3. **Client**: session settings (coders, conditions); the random condition
   and Show if items; the loop form (filter, criteria); the Units page and
   upload with `set` columns; the Links page; the deploy dialog (sign-in);
   the coding screen (sign-in requirement); the setup wizard; exports.
4. **Docs, help, examples, e2e.**

No migration of existing designs: there are none in use.
