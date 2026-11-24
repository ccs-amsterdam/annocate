# Coder API

What the coding screen (`HttpCoderApi`, driven by `StudyManager`) calls. Paths
are relative to `/api/d/<deploymentId>` (the study's public id), e.g. `/api/d/k3v9x2m4q7ta/session`
([deployment ids](README.md#deployment-ids)).

- Contracts: `coderEndpoints` in
  [`contracts/src/endpoints/coder.ts`](../../packages/contracts/src/endpoints/coder.ts);
  schemas in `contracts/src/session.ts`, `unit.ts`, `variableValue.ts`.
- Implementation: [`server/src/coder.ts`](../../packages/server/src/coder.ts)
  (routes), [`runtime/runtime.ts`](../../packages/server/src/runtime/runtime.ts) (the work).
- Caller: [`client/src/lib/api/httpCoderApi.ts`](../../packages/client/src/lib/api/httpCoderApi.ts).

| Endpoint | | Request | Response |
|---|---|---|---|
| [getSession](#getsession) | `GET /session` | – | `SessionResponseSchema` |
| [getSummary](#getsummary) | `GET /summary` | – | `CoderStudySchema` |
| [getNextUnits](#getnextunits) | `GET /loop/:loop/next?count=` | – | `NextUnitsResponseSchema` |
| [getLoopUnit](#getloopunit) | `GET /loop/:loop/units/:unitId` | – | `CoderUnitResponseSchema` |
| [postUnitVariables](#postunitvariables) | `POST /variables/unit` | `PostUnitVariablesSchema` | `SubmitUnitResponseSchema` |
| [postCoderVariables](#postcodervariables) | `POST /variables/coder` | `PostCoderVariablesSchema` | – |
| [assignCondition](#assigncondition) | `POST /experiment/:name` | – | `{ value }` |
| [endSession](#endsession) | `POST /end` | `EndSessionSchema` | `EndSessionResponseSchema` |
| [reopenSession](#reopensession) | `POST /reopen` | – | – |
| [quitSession](#quitsession) | `POST /quit` | `QuitSessionSchema` | – |
| [createTransfer](#createtransfer) | `POST /transfer` | – | `TransferResponseSchema` |
| [redeemTransfer](#redeemtransfer) | `POST /transfer/redeem` | `RedeemTransferSchema` | `RedeemTransferResponseSchema` |
| [postDisplay](#postdisplay) | `POST /display` | `DisplayEntrySchema` | – |
| [getNames](#getnames) | `GET /names` | – | `PickNamesResponseSchema` |
| [listSessions](#listsessions-outside-deployments) | `GET /api/coder/sessions` (not under `/d/`) | – | `CoderStudySchema[]` |
| [getSettings / putSettings](#settings-outside-deployments) | `GET` / `PUT /api/coder/settings` (not under `/d/`) | `UserSettingsSchema` | `UserSettingsSchema` |

## Sessions and headers

The session comes from an httpOnly device cookie (`annotinder_device`, one for
all studies; the session in a study is derived from it, `coder-identity.md`
§4), so the client must be served from the server's origin. No CORS headers.
Request headers:

| Header | When | What |
|---|---|---|
| `x-annotinder: 1` | always | CSRF: cross-site forms can't send it |
| `x-link-secret` | from the URL (`/code/<deployment>?link=<secret>`) | starts a session on first use. Without a link or with an unknown one: 404 `link_not_found`; revoked: 403 `link_revoked`; at its maximum: 403 `link_used_up`; retired (its coder left `coder_set`): 403 `link_inactive`. Started sessions go on |
| `x-url-params` | the page's other query parameters | the declared URL parameters (`urlParams`), a crowd's coder id parameter (`coderParam`) and `source`, stored as `$session` values (at most 256 characters; missing or invalid: 400 `url_param_missing` / `url_param_invalid`). The crowd's coder id is part of the device key, so a device keeps a session per coder id |
| `x-new-session: 1` | first request only | start another session for a coder id that already has one (after 409 `coder_has_session`) |
| `x-coder-name` | `pick_name` links | the picked name, URL-encoded ([getNames](#getnames)) |
| `x-annotinder-version` | after `GET /session` | the loaded session's `version` (below) |

The login cookie (`annotinder_session`) is read only to link the session to
its email once, or to find the email's session on a new device
(`coder-identity.md` §5). Where the invitation requires sign-in, a new session
without a login gets 401 `auth_required` (401 means nothing else), and an email
that isn't one of the coders 403 `email_not_allowed`.

**New design versions.** `GET /session` returns the deployment's `version`,
bumped on each deploy; the client sends it back on every request. Requests
with an old version (all but `/session` and `/transfer`) get 409
`design_changed` before anything is stored; the client reloads the session
and continues (`docs/client.md` §2).

Errors are `{ error, code? }`, with `code` from `CoderErrorCodeSchema`. See
[`docs/coder-identity.md`](../coder-identity.md).

## Endpoints

### getSession

`GET /session` → `SessionResponseSchema`

The **coder codebook** (`CoderCodebookSchema`, contracts `toCoderItems`)
and its `version`, per-loop progress and the coder's
variables (including experiments' conditions), and `ended` if the
session ended at an `end` item. The coder codebook has only what coding
needs: unit loops keep their layout items, questions and order, without their
`units` (the server works out the units: no parts, placements or
checks); no Study entry, no researcher notes, and experiments only with
their options (an invisible step: the client asks `assignCondition`). Creates
the session on first use, with its `$session` values: the coder
(`coder`: who the coder is, `coder-identity.md` §2), the URL parameters and `source`.
`login`: the email of the login the session belongs to, or null;
`canLogIn`: the link offers a login the coder hasn't used. `frozen`: the
coder-level answers that can't change any more, because the coder coded
units in a loop that depends on them (contracts `loopDependencies`).

### getSummary

`GET /summary` → `CoderStudySchema`: this device's session in the
deployment, for the coder home (`/code`): the study's public title
(`title`: the deployed design's `public.title`, null without one;
never the study's name, which is private), when it
started and was last active, how it ended (`ended`: `complete`,
`screenout`, `quit`; null while it goes on) and the units answered. 404
without a session; never starts one. The device's key includes the
crowd's coder id from the URL, so `x-url-params` with it finds the session of a link
that carries one. The server can't list a device's studies (its keys are
per study, §4 of coder-identity.md): the browser remembers which it
opened (`client/src/lib/session/studies.ts`) and asks each.

### listSessions (outside deployments)

`GET /api/coder/sessions` → `CoderStudySchema[]` (contracts
`coderAccountEndpoints`): a logged-in coder's studies, on any device: the
sessions their login's email is linked to. 401 `auth_required` without a
login. Continuing one on a new device logs in there (`coder-identity.md`
§5).

### getNextUnits

`GET /loop/:loop/next?count=<k>` → `NextUnitsResponseSchema` (`{ units }`)

`:loop` is the loop's `id` in the design (`loop_1`, `loop_2`, ...; contracts
`unitLoops`): the same loop in every version of the design. The same goes for
`loop` in `POST /variables/unit` and in the session's `progress`.

The server picks the coder's next `count` units (default 1, at most
`MAX_UNIT_BATCH`, 20): their own units in the loop (fixed, or a
shared queue with leases) and the overlap, in order. The ones they haven't
finished come first, so asking again returns the same ones until they are
answered: the client asks for a batch and again before it runs out. In a
shared queue each is leased to the coder (a lease they hold is renewed).
Empty: the coder is done with the loop. 409 while the study is paused
(`active: false`).

A loop can add the **test units** (the units' `test_set`: overlap,
practice, gold; `docs/architecture.md` §6.2) among the coder's own.
Their answer columns (`answer_<question>`, `feedback_<question>`) are not in
the unit's data. The unit's data has
`test_set`, its test set (`practice`, `overlap`, `gold`; null for a coding
unit), when the design uses `$unit.test_set`, and always on practice units.
A practice unit has `practice: { retry, message?, questions: { <question>: { key,
message? } } }`: the answer cells and feedback, so the client checks each
practice question as it is answered (contracts `answerKey.ts`), shows the
feedback, and with `retry` asks again until right. Gold and overlap units
look like any other (unless the design uses `$unit.test_set`); gold cells
never leave the server.

The server works out the units from the session's values: the session's
units (its coder's in `coder_set`, and the condition's in `condition_set`
of the experiment that selects units; one the coder has no condition for
yet is assigned now), plus the test units, within the loop's part and
placements, and a crowd loop's shared queue
(`units.divide`), or the units the coder finished in the previous loop
(`units.sameAsPrevious`; `architecture.md` §6.2). A session without a value it needs gets 409 `not_assigned`; a
session whose values select no units gets none in the loop.

### getLoopUnit

`GET /loop/:loop/units/:unitId` → `CoderUnitResponseSchema`

A unit the coder already has (finished, in progress or held), with their
answers: to go back to it, e.g. after resuming.

### postUnitVariables

`POST /variables/unit` (`PostUnitVariablesSchema`) → 200 `SubmitUnitResponseSchema`

One finished unit's answers: every question of the loop (`skip` for
questions a condition hid). Validated against the design, then stored
before the response; values of variables not sent (e.g. questions a
design update removed) are kept. `timings`: per question, how long the
coder took, as the browser measured it (`AnswerTimingSchema`,
`coder-identity.md` §10).

The response is usually `{}`. On practice questions the timing has
`tries`: the answers given until right. For a gold unit that brings the
coder's health to 0: `end`, the screen-out end item the session ended at (the
client shows it). A gold unit's response never says right or wrong.

### postCoderVariables

`POST /variables/coder` (`PostCoderVariablesSchema`) → 204

The coder-level answers (survey questions outside loops), all of them as
the client has them. The server writes a row for each answer that changed
(answer rows without a unit, like unit answers); values the server
assigned (experiments' conditions) and frozen answers (`frozen` in the session)
are left as they are. `timings`: for the
questions visited since the last post, how long the coder took; an
answer that didn't change gets its timing updated.

### assignCondition

`POST /experiment/:name` → `{ value }` (a `VariableValue`)

The coder reached the experiment `name` (`variable.type: "experiment"`) in
the design's flow (the client evaluates conditions): the server draws its
condition now, once, and
returns it; reached again, the same value. `draw: "random"` draws by
weight; `"balanced"` takes the option the fewest coders who reached it
have (a tie broken at random), under a lock, counting with `stratify` only coders with the same
answers to those questions (as saved: the client saves its answers first)
and the same `session.<name>` values. `"url_param"` takes the session's
URL parameter `param` (409 if it isn't one of the conditions). An
experiment that selects units (`selectsUnits: true`) without `options` draws from
`condition_set`'s values (409 while it has none).
404 for a name that is no experiment.

### endSession

`POST /end` (`EndSessionSchema`: `{ item?, unit? }`) → `EndSessionResponseSchema` (`{ reopen }`)

The coder reached this `end` item, or (without `item`) finished the study:
the session is over. The server stores the item and its outcome from the
design (`screenout` or `complete`; without an item `complete`; 400 if the
design has no such end item). An end inside a unit loop names the unit it
was reached on, `unit: { loop, id }` (400 unless the coder answered it; the
client saves the unit first). Afterwards units and answers are refused with
409 `session_ended`, and the session is closed unless the study keeps
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

### postDisplay

`POST /display` (`DisplayEntrySchema`: `{ keys, width?, theme? }`) → 204

How the coder's screen looks now (docs/client.md §4 "Display"): their keys
for answers, in responsive studies the width class (`narrow` / `wide`),
where coders choose it the theme. Sent when the coding screen starts and
when it changes (a width change after 3 seconds without another). Recorded
on the session with a timestamp when it differs from the last entry, at most
`MAX_DISPLAY_CHANGES` (100); the researcher's coder list shows them
(`CoderProgress.display`).

### getNames

`GET /names` (with `x-link-secret`) → `PickNamesResponseSchema`

No session needed, and none is started: on a link where coders pick their
name (`link: "pick_name"`), the coders' names and whether each is `taken`
(another device's, where a name stays on the first device). The coding
screen shows them after `getSession` answered 409 `name_required` (or
`name_taken`), and sends the picked name as `x-coder-name`
(URL-encoded) from then on.

### redeemTransfer

`POST /transfer/redeem` (`RedeemTransferSchema`) → `RedeemTransferResponseSchema`

No session needed: adds this device to the transferred session (and gives
it a device cookie if it has none). Each token works once.

### Settings (outside deployments)

`GET /api/coder/settings` → `UserSettingsSchema`; `PUT` replaces them (the
same body, 400 for anything unknown). The logged-in person's own settings
(the login cookie; 401 without): the theme, answering with keys, the
shortcut style and the shortcut badges, so they follow them to every
device. The coding screen reads them when it opens and saves each change
there too (`CoderSettingsProvider`); without a login they stay in the
browser.
