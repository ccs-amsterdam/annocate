# Plan: job overview, invitations, coders, units

## Problem

- There is no place that says how a job is doing: whether it's live, which
  codebook version coders use, how many units and coders there are, and
  whether coding is progressing.
- The Settings tab only renames, archives and deletes the job.
- "Coders" mixes two things: creating invitation links and coder progress.
  Invitations are stored by the db server, but there is no endpoint to list
  them, so a link disappears from the UI once you navigate away. They can't
  be revoked.
- Coder progress (`GET /coders`, `unitsDone` per unitset) comes from a
  legacy list (`coders.doneUnitIds`) that the removed coder routes
  maintained. It says nothing about when a coder started or was last active.
- Units are listed by external id only: you can't see what data (fields)
  units have. Unitsets are a separate tab of id lists.

## Tabs

**Overview** · Codebook · Units · Unitsets · Invitations · Coders · Preview

(Unitsets merges into Units in phase 3.)

## Phase 1: Overview tab (replaces Settings)

`GET /job/:jobId/overview` → `JobOverviewSchema` (contracts, `overview.ts`):

| field | meaning |
|---|---|
| `units` | number of units |
| `unitsets` | `{ name, units }[]` |
| `coders` | `{ total, started, activeLastDay }`: started = has given an answer |
| `answers` | live annotation values |
| `codings` | (unit, coder) pairs that finished a loop of the live codebook (same rule as the backend `finished` endpoint) |
| `lastActivity` | latest answer, or null |
| `activity` | `{ day, answers, coders }[]`: per day, the last 30 days |

The activity timeline is one `GROUP BY` day over the job's answers of the last
30 days. The mock server adds an index on `(jobId, created)`; a real db server
can do the same, or keep a per-day counter.

The tab shows:

- **Status**: Live (version, since), Paused, or Not published; and whether
  there's a draft. The live and draft versions link to the Codebook tab with
  that version open.
- **Units**: count, and unitsets with their sizes (links to Units).
- **Coders**: total, started, active in the last 24 hours, finished codings;
  open invitations (links to Invitations and Coders).
- **Activity**: answers per day, last 30 days.
- **Progress per loop** (when live): from the job server's
  `GET /deployment/status` (`sources`: complete/started/total units per
  unitset). Best effort; hidden if the job server can't be reached.
- **Settings** (bottom): rename, archive, delete; what was the Settings tab.

"Done" per coder (finished everything assigned to them) isn't shown: only the
job server knows how many units a coder gets (routing, loop limits). That
would need the job server to report it per coder; later.

## Phase 2: Invitations and Coders tabs

Invitations get their own resource:

| | |
|---|---|
| `GET /invites` | all invitations, with `uses`, `revokedAt` |
| `POST /invites` | create (was `POST /coders/invite`) |
| `POST /invites/:id/revoke` | stop accepting new coders. Coders who already started keep working |
| `DELETE /invites/:id` | only while unused (409 otherwise): coders and their answers refer to the invite they came from |

Coders remember their invite (`coders.inviteId`).

**Invitations tab**: create form, and a table of all invitations: label,
link (copy), login, participant id, presets, uses / max, status (open, used
up, revoked), revoke / delete.

**Coders tab**: `GET /coders` returns per coder: participant id, invite
label, started, last active, answers, and finished units per loop of the live
codebook. Replaces `unitsDone` (and the legacy `doneUnitIds` bookkeeping).

## Phase 3: units (done, 2026-10-19)

Built as proposed, with two changes: field types can't be changed yet (later),
and splitting units into sets moved to the client: the db server no longer
has `POST /unitsets/generate`, it only stores unitsets. Spec:
[docs/api/researcher.md#units-and-unitsets](api/researcher.md#units-and-unitsets).

### Unit fields with types

Proposal: a job has **unit fields** (`{ name, type }[]`, type `text`,
`number` or `boolean`), inferred from the first upload rather than declared up
front:

- A CSV column is `number` if every non-empty value parses as a number,
  `boolean` for true/false, else `text`. The researcher sees the inferred
  fields when uploading and can change a type.
- Unit data is stored typed (`"42"` from a CSV becomes `42`), so
  `{{$unit.count > 40}}` compares numbers, not strings.
- Later uploads are checked against the fields: a missing field, or a value
  that doesn't fit the type, is an error; a new column asks to add a field.
- The codebook editor warns about `$unit.x` references to fields that don't
  exist (and, later, type mismatches).
- Fields can't be removed or retyped once units are in use (immutable).

### Units page

- A table of units with a column per field, paginated
  (`GET /units?offset&limit&unitset=`, with data).
- Unitset badges on each unit; select a unitset to see its units in its
  order; create a unitset from selected units, or split (generate).
  Unitsets then no longer need their own tab.
