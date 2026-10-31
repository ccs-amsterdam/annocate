# Coder API

Served by the **server**, called by the client's **annotator**
(`HttpCoderApi`, driven by `JobManager`).

- Contracts: `coderEndpoints` in
  [`contracts/src/endpoints/coder.ts`](../../packages/contracts/src/endpoints/coder.ts);
  schemas in `contracts/src/session.ts`, `unit.ts`, `variableValue.ts`.
- Implementation: [`server/src/coder.ts`](../../packages/server/src/coder.ts)
  (routes), [`runtime/runtime.ts`](../../packages/server/src/runtime/runtime.ts) (the work).
- Caller: [`client/src/lib/api/httpCoderApi.ts`](../../packages/client/src/lib/api/httpCoderApi.ts).

All paths are under `/d/<deploymentId>`, e.g. `/d/42/session`
([deployment ids](README.md#deployment-ids)).

| Endpoint | | Request | Response |
|---|---|---|---|
| [getSession](#getsession) | `GET /session` | – | `SessionResponseSchema` |
| [getNextUnits](#getnextunits) | `GET /loop/:loop/next?count=&branch=` | – | `NextUnitsResponseSchema` |
| [getLoopUnit](#getloopunit) | `GET /loop/:loop/units/:unitId` | – | `CoderUnitResponseSchema` |
| [postUnitVariables](#postunitvariables) | `POST /variables/unit` | `PostUnitVariablesSchema` | – |
| [postCoderVariables](#postcodervariables) | `POST /variables/coder` | `PostCoderVariablesSchema` | – |
| [assignAuto](#assignauto) | `POST /variables/auto/:name` | – | `{ value }` |
| [createTransfer](#createtransfer) | `POST /transfer` | – | `TransferResponseSchema` |
| [redeemTransfer](#redeemtransfer) | `POST /transfer/redeem` | `RedeemTransferSchema` | `RedeemTransferResponseSchema` |
| [endSession](#endsession) | `POST /end` | `EndSessionSchema` | `EndSessionResponseSchema` |
| [reopenSession](#reopensession) | `POST /reopen` | – | – |
| [quitSession](#quitsession) | `POST /quit` | `QuitSessionSchema` | – |

## Sessions and headers

The session comes from an httpOnly device cookie set by the server
(`annotinder_device`, one for all jobs; the session in a job is derived from
it, `coder-identity.md` §4), so the client must be served from the server's
origin (in development, Vite proxies to the server). The
server sends no CORS headers for these paths.
Headers:

- `x-annotinder: 1` on every request (CSRF: cross-site forms can't send it);
- `x-invite-secret` from the URL (the link): create the coder on first
  use. A retired link (no longer part of the published design) is 403
  `link_inactive` for new sessions;
- `x-url-params`: the page's other query parameters. They hold the URL
  parameters the codebook's Session item declares, its participant id
  parameter, and the optional `source` (stored on the coder as `$session`
  values, with the link's own parameter values; at most 256 characters
  each; a missing or invalid one is 400 `url_param_missing` /
  `url_param_invalid`). The participant id is also part of the device's key
  for the session (a device keeps a session per participant id);
- `x-new-session: 1` (first request only): start another session for a
  participant that already has one;
- the login cookie (`annotinder_session`, from `/auth/login`): read only to
  link the session to its email once, or to find the email's session on a
  new device (`coder-identity.md` §5); 401 `auth_required` where a login is
  required, 403 `email_not_invited` for a login not on the link's list, or
  (sets assigned by email) not among the group's set names;
- `x-annotinder-version`: the `version` of the loaded session (below).

**New codebook versions.** `GET /session` returns the deployment's
`version`, bumped when another codebook version is published. The client sends it back with every
request. After a publish, requests with the old version (all but
`/session` and `/transfer`) answer 409 `codebook_changed`, before anything
is stored; the client then loads the session again and continues where it
was (`docs/client.md` §2).

Errors are `{ error, code? }`, with `code` from `CoderErrorCodeSchema`. See
[`docs/coder-identity.md`](../coder-identity.md).

## Endpoints

### getSession

`GET /session` → `SessionResponseSchema`

The **coder codebook** (`CoderCodebookSchema`, contracts `toCoderItems`)
and its `version`, per-loop progress and the coder's
variables (including assigned `auto` variables), and `ended` if the
session ended at an `end` item. The coder codebook has only what coding
needs: unit loops keep their layout, questions, order and per branch only
its `when` condition (the client sends the branch index; the server works
out the units); no modes, sets or overlap, no Session item, no researcher
notes, and `auto` questions only with their options. Creates the coder and session on first
use. `login`: the email of the login the session belongs to, or null;
`canLogIn`: the invite offers a login the coder hasn't used. `frozen`: the
coder-level answers that can't change any more, because the coder coded
units in a loop that depends on them (contracts `loopDependencies`).
Assigns the coder's `auto` variables they don't have yet (`random` or
`balanced`).

### getNextUnits

`GET /loop/:loop/next?count=<k>&branch=<i>` → `NextUnitsResponseSchema` (`{ units }`)

`:loop` is the loop's position in the codebook version the coder runs
(contracts `unitLoops`: `1`, `2`, ...); loops have no name. The same goes for
`loop` in `POST /variables/unit` and `unitset` in the session's `progress`.

The server picks the coder's next `count` units (default 1, at most
`MAX_UNIT_BATCH`, 20) from the coder's branch: their own units (a set, or a
shared queue with leases) and the overlap, in order. The ones they haven't
finished come first, so asking again returns the same ones until they are
answered: the client asks for a batch and again before it runs out. In a
shared queue each is leased to the coder (a lease they hold is renewed).
Empty: the coder is done with the loop. 409 while the job is paused
(`active: false`).

The client chooses the branch (`NextUnitQuerySchema`): the index of the
first branch in the loop's `units` whose `when` holds. The server picks the
set (the branch's fixed set, or in `assign` mode a drawn set or the one a
session value names; 400 for an unknown branch, 409 if a set doesn't
exist) and stores the routing (`{ set: "group/set", at }`); afterwards the
parameter is ignored (routing is sticky, `architecture.md` §6.1). Without
it, a loop with a single unconditional branch routes by itself; other loops
answer 409 with code `branch_required`. A coder whose session value names
no set of the group gets no units in the loop.

### getLoopUnit

`GET /loop/:loop/units/:unitId` → `CoderUnitResponseSchema`

A unit the coder already has (finished, in progress or held), with their
answers: to go back to it, e.g. after resuming.

### postUnitVariables

`POST /variables/unit` (`PostUnitVariablesSchema`) → 204

One finished unit's answers: every question of the loop (`skip` for
questions a condition hid). Validated against the codebook, then stored
before the response; values of variables not sent (e.g. questions a
codebook update removed) are kept. `timings`: per question, how long the
coder took, as the browser measured it (`AnswerTimingSchema`,
`coder-identity.md` §10).

### postCoderVariables

`POST /variables/coder` (`PostCoderVariablesSchema`) → 204

The coder-level answers (survey questions outside loops), all of them as
the client has them. The server writes a row for each answer that changed
(answer rows without a unit, like unit answers); values the server
assigned (`auto` questions) and frozen answers (`frozen` in the session)
are left as they are. `timings`: for the
questions visited since the last post, how long the coder took; an
answer that didn't change gets its timing updated.

### assignAuto

`POST /variables/auto/:name` → `{ value }` (a `VariableValue`)

The coder reached the `auto` question `name` in the codebook's flow (the
client evaluates conditions): the server assigns its value now, once, and
returns it; reached again, the same value. `random` draws by weight;
`balanced` takes the option the fewest coders who reached it have, under a
lock, counting with `stratify` only coders with the same answers to those
questions (as saved: the client saves its answers first) and the same
`session.<name>` values. 404 for a name that is no `auto` question.

### endSession

`POST /end` (`EndSessionSchema`: `{ item?, unit? }`) → `EndSessionResponseSchema` (`{ reopen }`)

The coder reached this `end` item, or (without `item`) finished the job:
the session is over. The server stores the item and its outcome from the
codebook (`screenout` or `complete`; without an item `complete`; 400 if the
codebook has no such end item). An end inside a unit loop names the unit it
was reached on, `unit: { loop, id }` (400 unless the coder answered it; the
client saves the unit first). Afterwards units and answers are refused with
409 `session_ended`, and the session is closed unless the job keeps
sessions open (`coder-identity.md` §9): `GET /session` returns `ended` and
only `endValues` (what the end screen shows), and `getLoopUnit` answers 409
`session_closed`. `reopen`: whether, and until when, the coder can go back
(null: not). Ending an ended session changes nothing.

### reopenSession

`POST /reopen` → 204: goes back after completing, while `reopen` allows (409
`session_closed` otherwise): the session is open again, with all its
answers.

### quitSession

`POST /quit` (`QuitSessionSchema`: `{ requestDeletion }`) → 204

The coder quits: if the session hadn't ended, it ends with outcome `quit`
(no item). With `requestDeletion` the coder also asks for their answers to
be deleted (also after the session ended): `GET /session` then returns
`deletionRequest`. The researcher decides on it (docs/coder-identity.md §8).

### createTransfer

`POST /transfer` → `TransferResponseSchema`

A one-time token to continue this session on another device ("Continue on
another device").

### redeemTransfer

`POST /transfer/redeem` (`RedeemTransferSchema`) → `RedeemTransferResponseSchema`

No session needed: adds this device to the transferred session (and gives
it a device cookie if it has none). Each token works once.
