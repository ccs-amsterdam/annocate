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
| [getNextUnit](#getnextunit) | `GET /loop/:loop/next?branch=&unitsets=` | – | `CoderUnitResponseSchema \| null` |
| [getLoopUnit](#getloopunit) | `GET /loop/:loop/units/:unitId` | – | `CoderUnitResponseSchema` |
| [postUnitVariables](#postunitvariables) | `POST /variables/unit` | `PostUnitVariablesSchema` | – |
| [postCoderVariables](#postcodervariables) | `POST /variables/coder` | `PostCoderVariablesSchema` | – |
| [createTransfer](#createtransfer) | `POST /transfer` | – | `TransferResponseSchema` |
| [redeemTransfer](#redeemtransfer) | `POST /transfer/redeem` | `RedeemTransferSchema` | `RedeemTransferResponseSchema` |

## Sessions and headers

The session is an httpOnly cookie set by the server, so the client must be
served from the server's origin (in development, Vite proxies to the server). The
server sends no CORS headers for these paths.
Headers:

- `x-annotinder: 1` on every request (CSRF: cross-site forms can't send it);
- `x-invite-secret` from the URL: create the coder on first use;
- `x-url-params`: the page's other query parameters. They hold the
  participant id and the invite's required parameters (stored on the coder
  as `$session` values; a missing or invalid one is 400 `url_param_missing`
  / `url_param_invalid`) and `url_param` auto variables. The participant id
  also selects the session cookie (`coder-identity.md` §4);
- `x-new-session: 1` (first request only): start another session for a
  participant that already has one;
- the login cookie (`annotinder_session`, from `/auth/login`): on invites
  that take logins, the session is the login's, on any device
  (`coder-identity.md` §5); 401 `auth_required` where a login is required,
  403 `email_not_invited` for a login not on the invite's list;
- `x-annotinder-version`: the `version` of the loaded session (below).

**New codebook versions.** `GET /session` returns the deployment's
`version`, bumped on every publish. The client sends it back with every
request. After a publish, requests with the old version (all but
`/session` and `/transfer`) answer 409 `codebook_changed`, before anything
is stored; the client then loads the session again and continues where it
was (`docs/client.md` §2).

Errors are `{ error, code? }`, with `code` from `CoderErrorCodeSchema`. See
[`docs/coder-identity.md`](../coder-identity.md).

## Endpoints

### getSession

`GET /session` → `SessionResponseSchema`

The codebook and its `version`, per-loop progress and the coder's
variables (including assigned `auto` variables), and `ended` if the
session ended at an `end` item. Creates the coder and session on first
use. `login`: the email of the login the session belongs to, or null;
`canLogIn`: the invite offers a login the coder hasn't used.

### getNextUnit

`GET /loop/:loop/next?branch=<i>&unitsets=<name>&unitsets=<name>` → `CoderUnitResponseSchema | null`

`:loop` is the loop's position in the codebook version the coder runs
(contracts `unitLoops`: `1`, `2`, ...); loops have no name. The same goes for
`loop` in `POST /variables/unit` and `unitset` in the session's `progress`.

The server picks the coder's next unit from the coder's branch: their own
units (a set, or a shared queue with leases) and the overlap. `null`: the coder is
done with the loop. 409 while the job is paused (`active: false`).

The client chooses the branch (`NextUnitQuerySchema`): the index of the
first branch in the loop's `units` whose `when` holds, and its unitset
names with `$var` references filled in (`branchUnitsets`: its own set, then
the overlap; empty where the server picks the set, in `sets` and
`invitation` mode). The server checks them (400 if the names don't fit that
branch, 409 if a unitset doesn't exist) and stores the routing; afterwards the parameters
are ignored (routing is sticky, `architecture.md` §6.1). Without them, a
loop with a single unconditional branch without references routes by
itself; other loops answer 409 with code `branch_required`.

### getLoopUnit

`GET /loop/:loop/units/:unitId` → `CoderUnitResponseSchema`

A unit the coder already has (finished, in progress or held), with their
answers: to go back to it, e.g. after resuming.

### postUnitVariables

`POST /variables/unit` (`PostUnitVariablesSchema`) → 204

One finished unit's answers: every question of the loop (`skip` for
questions a condition hid). Validated against the codebook, then stored
before the response; values of variables not sent (e.g. questions a
codebook update removed) are kept.

### postCoderVariables

`POST /variables/coder` (`PostCoderVariablesSchema`) → 204

Full replace of the coder-level answers (survey questions outside loops).

### endSession

`POST /end` (`EndSessionSchema`: `{ item, unit? }`) → 204

The coder reached this `end` item: the session is over. The server stores
the item and its outcome from the codebook (`screenout` or `complete`; 400
if the codebook has no such end item). An end inside a unit loop names the
unit it was reached on, `unit: { loop, id }` (400 unless the coder answered
it; the client saves the unit first). Afterwards units and answers are
refused with 409 `session_ended`; `GET /session` returns `ended`, so the
client shows the ending again, with that unit's data and answers
(`getLoopUnit` still works for it), as its message may use them. Ending an
ended session changes nothing.

### quitSession

`POST /quit` (`QuitSessionSchema`: `{ requestDeletion }`) → 204

The coder quits: if the session hadn't ended, it ends with outcome `quit`
(no item). With `requestDeletion` the coder also asks for their answers to
be deleted (also after the session ended): `GET /session` then returns
`deletionRequest`. The researcher decides on it (docs/coder-identity.md §8).

### createTransfer

`POST /transfer` → `TransferResponseSchema`

A one-time token to continue this session on another device ("Continue on
another device"). 400 for a logged-in coder: they log in on the other
device instead.

### redeemTransfer

`POST /transfer/redeem` (`RedeemTransferSchema`) → `RedeemTransferResponseSchema`

No session needed: sets this device's session cookie to the transferred
session. Each token works once.
