# Coder sessions, identity and login

Coder sessions without login (§4), coder login (§5), researcher login (§7),
quitting and deleting data (§8), closing sessions (§9) and response times
(§10). Complements `architecture.md`.

## 1. Principles

- **The login provider proves who someone is; the server decides whether
  they get in** (study roles, the coder invitation). No passwords on the
  server.
- **Only authentication unlocks earlier work from another device.** An id
  from a link (a coder id in a panel URL, or one fixed on a link) is a
  *label*, not a credential: anyone with the link could use it.
- **Unauthenticated work stays on its device**, unless the coder moves it
  with a one-time transfer link.

## 2. Terms

| Term | What | Where |
| --- | --- | --- |
| **Coder session** (`sessionId`) | One coder's run through a study: answers, progress. Everything is keyed by it | `coder_sessions` |
| **Device id** | A random secret the server gives a browser once, for all studies, in the httpOnly cookie `annotinder_device`. Never stored by the server | the browser |
| **Device key** | SHA-256 of device id, deployment and the crowd's coder id from the URL (if any): the device's key to its session in one study. Only this is stored, so a device's sessions in different studies can't be linked. One per device of a session | `session_devices` |
| **Coder id** (`coder`) | Who the coder is: `$session.coder`, the results' `coder` column. Specific coders: their value in the coders' column. A crowd: the `coderParam` URL value (e.g. `PROLIFIC_PID`), else the login's email where sign-in is required, or a coder id fixed on the link. A label, never a credential | `coder_sessions.coder` |
| **Linked email** | A verified address from a login (§5), linked to the session once, to continue on other devices | `coder_sessions.email` |
| **Transfer link** | A one-time link (15 minutes) that adds another device to the session | `transfers` (token hash only) |

The system never merges sessions. Researchers who want to merge sessions of
one person group them by coder id or email in analysis.

## 3. Links

Links are made by deploying: one, or one per coder for specific coders with a
link each (`architecture.md` §7). A link no longer part of the design is
retired (403 `link_inactive` for new sessions; started sessions go on). A
revoked link (403 `link_revoked`) can be reopened. The coder invitation
(`architecture.md` §6.1) decides how a session starts:

| Invitation | Sign-in | The coder (`$session.coder`) |
| --- | --- | --- |
| specific coders, `per_coder` | optional | the link's coder |
| specific coders, `pick_name` | optional | the picked name (`nameDevices: "first"`: the first device's; `"any"`: picking it continues its session) |
| specific coders, `login` | required; only the column's addresses (403 `email_not_allowed`) | the login's address |
| crowd | optional | none, a coder id fixed on the link, or `coderParam` (`?<param>=…`, required unless `optional: true`) |
| crowd with `login: true` | required (401 `auth_required`) | the login's email, unless the URL or link gives one |

Coders can always log in, to resume elsewhere. Where sign-in is optional,
researchers don't see the email (contracts `loginRequired`). A link's
`maxUses` (or the crowd's `maxCoders`) caps its sessions.

**Duplicate coder ids are allowed**: a coder who can't reach their first
session (§4) starts another, as can anyone holding a link with that coder id.
Each is its own session with the same `coder` (so panel redirects carry it
either way); researchers handle duplicates in analysis. What is guarded is
privacy: no session is opened by a label.

## 4. Sessions without login

- **The device id.** A browser gets one random device id the first time a
  link accepts it: cookie `annotinder_device`, `HttpOnly`, `SameSite=Lax`,
  `Secure` over https, `Path=/api/d`, 400 days. One cookie for all studies.
- **The session in a study.** Per request the server derives the device key
  (SHA-256 of device id, deployment and the crowd's coder id from
  `x-url-params`) and finds the session with one indexed query. Including the
  coder id keeps coders apart on a shared lab computer. Only the key is
  stored; the id is long and random, so no server secret is involved
  (rotating `ANNOTINDER_SECRET` logs no coder out). Everything the study needs
  from the link and URL is stored when the session starts.
- **Device details.** When a device joins, its type (phone, tablet,
  desktop), browser and OS are stored (`shared/devices.ts`), not the user
  agent. Each answer records its device (`annotation_values.device_id`);
  researchers get them via `GET /study/:studyId/devices` and `devices.csv`.
- **Session values.** The design declares URL parameters (`urlParams`,
  `architecture.md` §7) and a crowd's coder id parameter (`coderParam`). A new
  session without a required value, or with one that doesn't fit (a list, or
  a pattern matched in full; at most 256 characters) is refused with 400
  `url_param_missing` / `url_param_invalid`, so a broken panel link shows at
  once (`runtime/sessionValues.ts`). With the coder and the optional
  `?source=` they are stored in `coder_sessions.session` and are
  `$session.coder`, `$session.source` and `$session.<name>`.
- **Same device later.** The cookie resumes the session whatever link (or
  none) the coder comes back with, as long as the URL carries the same coder
  id.
- **CSRF.** Every coder API request needs `x-annotinder: 1`, and the coder
  API sends no CORS headers. This relies on client and server sharing an
  origin.
- **Another device.** "Continue on another device":
  1. `POST /d/:deployment/transfer` returns a one-time token (15 minutes),
     shown as a link and a QR code.
  2. On the new device, `POST /d/:deployment/transfer/redeem` adds it to the
     session (keys without and with the session's coder id). Both devices can
     continue.

  Tokens are stored as hashes and deleted when used.
- **A link with a coder id on a new device** (no cookie, and that coder
  already has a session: a crowd's `coderParam`, a fixed coder id, or a
  specific coder's own link):
  1. The server refuses to create a second session silently:
     `409 { code: "coder_has_session" }`.
  2. The client says: continue on the original device, or make a transfer
     link there.
  3. Only for a coder who can't get back (lost device, cleared browser):
     **I can't get back to my earlier session…** asks to confirm, then **Start
     a new session** retries with `x-new-session: 1` (first request only). The
     new session can't see the earlier answers.

  New sessions of a known coder don't count toward the link's `maxUses`. This
  tells someone holding the link that the coder id was used before, nothing
  else.
- **Anonymous links on a new device** simply start a new session.
- **The coder home** (`/code`) lists this browser's studies: the browser
  remembers the studies it opened (deployment and URL parameters, never a
  link secret) and asks each (`GET /d/<id>/summary`), since the server can't
  list a device's sessions. A logged-in coder also sees sessions linked to
  their email (`GET /coder/sessions`). It shows each study's public title,
  never the (private) study name.
- **Not built:** offering a longer-lived "continue later" link at the start
  of long studies (no PINs or passwords: easily forgotten, little gain).

## 5. Coder login

The researcher login (§7), with the same login cookie (`annotinder_session`).
A login doesn't replace the session: it **links an email to the session,
once**. After that the device key is the session as for anyone, and logging
out doesn't affect coding. Code: `coder.ts`, `DeploymentRuntime.resolveCoder`,
`runtime/store.ts`.

- **The invitation decides.** Coders can always log in. Sign-in is required
  for specific coders with `link: "login"` and a crowd with `login`; only
  there do researchers see coders' emails (Coders tab, export).
- **When a login is read**: only while the session has no email, or on a
  device without a session in this study. Never while coding, never in
  previews.
- **Required**: without a login 401 `auth_required`; the client offers the
  login and comes back to the same page. Addresses not in the column get 403
  `email_not_allowed`.
- **Optional**: `GET /session` says `canLogIn`; logging in links the email.
- **Another device**: logging in on a device without a session in this study
  finds the email's session and adds the device (also without the link).
- **One session per email per study**: a device that started its own session
  and then logs in continues the email's session instead.
- **Accounts**: logging in creates a user with account role `user`
  (`accounts.md`).

Possible later: a system with its own login (e.g. AmCAT) vouches for a coder
with a short signed assertion, so coders don't log in twice.

## 6. Open points

- **Removing a device** from a session (e.g. a lost phone): possible, since
  devices have their own keys; not built.
- **A long-lived "continue later" link** (§4): one per session, revocable;
  single use or not?
- **Duplicate work**: shared queues count per session, so two sessions of
  one person can code the same unit. Possibly treat sessions with the same
  coder id as one person.

## 7. Researcher login

Code: `server/src/oidc.ts`, `researcher/login.ts`, `shared/sessions.ts`;
client `components/admin/account/`. Endpoints: `docs/api/researcher.md`.

- **The provider proves who someone is; the session is ours.** Any OpenID
  Connect provider, by issuer URL. The server runs the authorization code flow
  with PKCE itself (`/auth/login`, `/api/auth/callback`), so tokens never reach
  the browser; it checks the ID token and starts its own session: a random key
  in an httpOnly cookie, its hash in `sessions`, 14 days, sliding. Requests
  need `x-annotinder: 1` (CSRF). Provider tokens aren't kept. Logging out
  (`POST /auth/logout`) ends our session, not the provider's.
- **Identity is the login, not the email** (`accounts.md` §1). A login
  without `email_verified: true` is refused. The user is `iss` + `sub`; the
  email is updated at each login. Roles given to an address before its owner
  logged in are claimed at first login (within 3 months).
- **Reassigned addresses**: a later owner of an address doesn't get the
  previous owner's account, and the safeguards keep them from old
  invitations.
- **Second factor**: required for managing the server and for sensitive
  actions (recent: step-up); researchers and coders work without
  (`security.md` §1).
- **Account roles** and limits: `accounts.md`.
- **Setting up a provider** (e.g. Authentik): redirect URI
  `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`, scopes `openid email`, a
  confidential client. `email_verified` must reflect a real check; social
  logins may only be linked to existing users by email if that source verifies
  addresses; a lost second factor must not be recoverable by email alone.
- **Not built:** a list of active sessions, logging out everywhere, logout at
  the provider.

## 8. Quitting, and deleting a coder's data

Coders can always leave and have their data deleted; nothing is deleted by
accident or to undo paid work.

**Coder side** (the door icon, `QuitMenu.tsx`):

- *Stop for now*: nothing changes; the dialog explains how to continue (same
  link, same device and browser, or a transfer link first).
- *Quit this study*: `POST /quit` ends the session (`ended: { outcome:
  "quit", at }`); answers are kept.
- *Quit and ask to delete my answers*: `POST /quit { requestDeletion: true }`
  also records `coder_sessions.deletion_request`. The coder types a word to
  confirm. Also offered on the end screen; not in previews.

It is a request, not a deletion: AnnoTinder can't know whether the researcher
holds the data elsewhere, and immediate deletion would let a paid coder
withdraw the work after payment. It needs no proof of identity: it comes from
the session itself.

**Researcher side** (Coders tab): open requests come first, with *Delete now*
or *Delete later* (`POST /study/:studyId/coders/:id/deletion-request/postpone`
sets `postponedAt`; the request stays until the data is deleted). Declining
isn't a button: that is for the researcher's protocol. Any coder's data can be
deleted (`POST /study/:studyId/coders/delete { sessionIds?, coders?, emails? }`,
ADMIN): the sessions (device keys, coder id, the request) and all their
answers, also retired ones. Unit versions stay. A deleted coder's browser
later starts a new session from its link.

Every deletion is logged (`session_deletions`: session id, coder id,
requested, deleted, by whom, answer count; no email), so the researcher can
also delete the coder from earlier downloads (`GET /study/:studyId/coders/deletions`,
the Coders tab, `deleted_coders.csv`). The export also has `ended` = `quit`
and a `deletion_requested` column.

## 9. Closing finished sessions

A session that ended (an `end` item, finishing the study, or quitting) is
**closed** unless the study keeps sessions open (`studies.keep_sessions_open`,
off by default). So finished data won't change, and someone who later gets
into a coder's login or device doesn't see their answers.

- A closed session gets only what its end screen shows: `GET /session`
  returns `endValues` (the answers and unit fields the end message and
  redirect mention) and no other `variables`; `getLoopUnit` answers 409
  `session_closed`.
- Finishing without an `end` item also ends the session (`POST /end` without
  an item, outcome `complete`).
- **Going back**: after completing (not after a screen-out, quitting or a
  deletion request) the coder can go back for 15 minutes (`REOPEN_MS`; always
  if the study keeps sessions open): `POST /reopen`. `reopen` in `POST /end`'s
  response and in `GET /session` says until when.

Not done on purpose: limiting how far back coders can go during a session.
Coder-level answers are in the browser anyway (conditions use them).

## 10. Response times

Always on: how long coders take per question, for analysis (reading time)
and for spotting clicking-through. In the download (`timings.csv`, and per
unit in `annotations.csv`); mentioned on the privacy help page.

- **The browser measures per question** (`client/src/lib/studyManager/timing.ts`,
  `AnswerTimingSchema`): time to first answer (`firstMs`), time on screen over
  all visits (`totalMs`), time with the page hidden (`hiddenMs`), and how often
  the answer changed (`edits`). Waiting for the server isn't counted. Sent with
  the answers (`timings`) and stored on the answer row
  (`annotation_values.timing`).
- **The server's bound**, since a browser can be tampered with: when the
  server first handed out the unit (`unit_serves`, `servedAt` in
  `listAnnotations`) to the last answer bounds the time on its questions;
  coder-level answers are bounded by the previous post. The download flags
  browsers claiming more time than the server saw (`exceeds_server`, 2 s
  leeway). Too-fast answers show in the server's times themselves.
- Later: inspecting times, distributions, fraud flags.
