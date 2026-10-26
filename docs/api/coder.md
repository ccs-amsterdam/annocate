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
served from the server's origin (in development, Vite proxies `/d/`). The
server sends no CORS headers for these paths.
Headers:

- `x-annotinder: 1` on every request (CSRF: cross-site forms can't send it);
- `x-invite-secret`, `x-participant-id` from the URL: create the coder on
  first use; the participant id also selects the session cookie;
- `x-url-params`: the page's other query parameters, for `url_param` auto
  variables;
- `x-new-session: 1` (first request only): start another session for a
  participant that already has one.

Errors are `{ error, code? }`, with `code` from `CoderErrorCodeSchema`. See
[`docs/coder-identity.md`](../coder-identity.md).

## Endpoints

### getSession

`GET /session` → `SessionResponseSchema`

The codebook, per-loop progress and the coder's variables (including
assigned `auto` variables). Creates the coder and session on first use.

### getNextUnit

`GET /loop/:loop/next?branch=<i>&unitsets=<name>&unitsets=<name>` → `CoderUnitResponseSchema | null`

The server picks the coder's next unit from the sources of the coder's
branch (fixed sets, or a shared queue with leases). `null`: the coder is
done with the loop. 409 while the job is paused (`active: false`).

The client chooses the branch (`NextUnitQuerySchema`): the index of the
first branch in the loop's `units` whose `when` holds, and its unitset
names with `$var` references filled in, one per source. The server
checks them (400 if the names don't fit that branch's sources, 409 if a
unitset doesn't exist) and stores the routing; afterwards the parameters
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

### createTransfer

`POST /transfer` → `TransferResponseSchema`

A one-time token to continue this session on another device ("Continue on
another device").

### redeemTransfer

`POST /transfer/redeem` (`RedeemTransferSchema`) → `RedeemTransferResponseSchema`

No session needed: sets this device's session cookie to the transferred
session. Each token works once.
