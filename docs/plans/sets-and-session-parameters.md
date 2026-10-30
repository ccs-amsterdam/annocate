# Plan: set groups, session parameters and generated links

Status (2026-10-30): agreed in discussion; being built (§8 tracks it).

## Why

Unitsets were ordered lists of units with free names, grouped by name
prefixes (`part_1`, `part_2`, `part_overlap`). Handing a set to each coder
needed a mode per way of choosing ("one set per coder", "the invitation's
units", names built from answers), and links had to be made by hand to
match the codebook: a codebook that hands out sets by link only worked if
the researcher made exactly the right invitations. That is error prone and
not visible in the codebook.

This plan makes three things explicit:

1. **Set groups**: a group is a column of the units; each unit's cell says
   which set(s) it is in. The overlap is a reserved set in the group.
2. **Session parameters**: the codebook declares what a link carries (link
   parameters) and what may be added to it (URL parameters).
3. **Generated links**: the links follow from the codebook's link
   parameters; the researcher manages access, not which links exist.

## 1. Set groups

- A **group** is named like a field (letters, digits, `_`; not starting
  with `_`). Its **sets** have names of up to 128 characters, without `;`
  or `#`. Names starting with `_` are reserved: for now only `_overlap`
  (later `_gold`).
- Stored per unit: `unit_sets (job_id, grp, set, unit_id, position)`.
  A unit can be in several sets of a group (e.g. chained overlap: 1-10,
  5-15, 10-20). `position` is optional: a set is in position order if its
  units have positions, else in the units' order.
- Not part of the unit's data: moving a unit to another set is not a new
  unit version.
- **As a column** (upload and download): a cell holds `s1`, `s1;s2`, or
  `s1#3;s2#1` (position 3 in s1, 1 in s2). The upload marks such a column
  with the type **sets**; the column name is the group. The download writes
  each group as a column in the same format.
- **Split into sets** (Units page) makes or replaces a group: the units
  marked `_overlap` (a number or a percentage, drawn with a fixed seed, or
  the ones already marked) and N sets of the other units.

The old `unitsets` become group `unitsets` (each unitset a set, in its
order) in the migration.

## 2. Unit loops

A loop's branch (coder groups with `when` stay) is one of:

| Mode | Settings |
| --- | --- |
| **Everyone codes everything** (`all`) | all units, or one set (`{ group, set }`) |
| **Crowd coding** (`shared`) | all units, or one set; the queue's rules as now; overlap from the set's group |
| **Assign a set** (`assign`) | a group, and where the coder's set comes from: **drawn** here (`balanced` or `random`), or from a **session value** (a set-typed link or URL parameter, or `email` / `participant`) |

**Overlap** (`assign`, and `shared` over a set): the group's `_overlap`
units, mixed into every coder's units. `placement`: `first`, `last`,
`spread` or `disabled` (required in `assign`: a deliberate choice).
Optional: `expect` (the number of overlap units the researcher wants: a
warning when the group has fewer), and `max` with `pick` (`first` or
`random`, seeded) to use at most that many. The editor warns when the
placement isn't disabled but the group has no `_overlap` units. A coder's
own set leaves out units that are also overlap units.

Removed: `sets` and `invitation` modes, and unitset names built from
answers (`part_$var.slot.value`): routing by an answer is a coder group
(`when`) per value, or a set-typed session value.

The coder's set is stored with the coder (routing, as now) by the
branch's fingerprint, so it sticks.

## 3. Session parameters

A codebook item **Session** (`type: "session"`, at most one, first)
declares:

- **Link parameters** (`kind: "link"`): fixed in the link. Values are a
  list (`{ value, label? }`), or **the sets of a group** (`{ sets: group }`,
  from the units' data). By default every combination of the link
  parameters gets a link; `combinations` lists only those wanted.
- **URL parameters** (`kind: "url"`): added to a link by whoever shares it
  (a panel, a newsletter). The URL key (`param`, default the name),
  required or with a `default`, and values as a list, the sets of a group,
  or **open** (at most 256 characters, optional `pattern`). They never make
  more links.
- **Participant id**: optionally from a URL parameter (`participant:
  { param, pattern? }`).

All are `$session.<name>` values, stored on the session when it starts.
Reserved names (can't be declared): `participant`, `source`, `email`.
`source` is always accepted as a URL parameter (tracking, e.g. per
channel) and stored. `email` is the login's email, when the coder logged
in.

A parameter whose values are the sets of a group is **set-typed**: an
`assign` branch can take its set from it (`from: { session: name }`), and
only for that group. `from: { session: "email" }` or `"participant"` takes
the set named by the coder's email or participant id (e.g. a column of
coder emails): only those can take part, and the editor says so ("Only
the N email addresses in column `coder` can code"). Email requires login.

## 4. Generated links

- Links are made from the **published** codebook: one per combination of
  link parameter values (one link if there are none). They are keyed by
  their values, so a link's secret survives new versions and set changes.
- Sync: on publish and when set groups change. A combination that is no
  longer part of the design (a removed set, a parameter value dropped) is
  **retired**: the link says "This link is no longer active", coders who
  started keep working. It comes back if the combination returns.
- Limits: above 500 links publishing asks for confirmation; at most 2000.
- The **Invitations** page manages links, not design: label, login
  (none, optional, required), allowed emails, max uses, fixed participant
  id, revoke, and a new secret. It shows each link's parameter values and
  the URL parameters a link takes. There is no "create invitation".
- A coder arriving with a set that no longer exists (a retired link) can't
  start; an email that isn't among a group's sets: "This email address has
  no access to this study".

## 5. Auto variables

`auto` items keep `random` and `balanced`. The `invite` and `url_param`
sources go: those are link and URL parameters now. They stay coder-level
items. Later (§8, phase 3): assigned when the coder reaches them, by the
server once the answers they depend on are saved (stratified balancing:
balanced within the groups of earlier answers).

## 6. Recipes, examples and the setup wizard

- A recipe has `sets` (groups by the units' ids) instead of `unitsets`,
  and no `invites`: links are generated when its codebook is published
  (examples publish; the development demo keeps its fixed secret).
- The wizard's **Assign sets** writes a group (split or by a column) and
  an `assign` branch: drawn (`balanced`), or by link (a set-typed link
  parameter, so a link per set). **Experimental groups**: a group from the
  chosen column values per condition, and a coder group per condition
  (`when $var.condition.value == ...`, all units of that condition's set).
  Crowd coding with an overlap: a group with set `queue` and `_overlap`.

## 7. Data and exports

- `coders.session` keeps the session values (as now); `coders.csv` has a
  column per session value.
- `units.csv` in the download has a column per group.
- Invites: `params` (link parameter values), `link_key` (their canonical
  form), `retired_at`; the per-invite `participant_param`, `url_params`,
  `variables` and `unitset_id` go (they are in the codebook now).

## 8. Order of work

1. **Set groups and loop modes**: table and migration, API, upload and
   download as columns, Split into sets, `all`/`shared`/`assign` with
   overlap settings, routing, editor, wizard, examples, tests, help.
2. **Session parameters and generated links**: the Session item, session
   values from links and URLs, link sync and limits, the Invitations page,
   `auto` without `invite`/`url_param`, coder errors, tests, help.
3. **Auto variables when reached**, then stratified balancing.
