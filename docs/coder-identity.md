# Coder sessions, identity and login

The study's coders (§2), coder sessions without login (§4), coder login
(§5), researcher login (§7), quitting and deleting data (§8), closing
sessions (§9) and response times (§10). Complements `architecture.md`.

## 1. Principles

- **The login provider proves who someone is; the server decides whether
  they get in** (study roles, the who codes). No passwords on the
  server.
- **Only authentication unlocks earlier work from another device.** An id
  from a link (a coder id in a panel URL, or a expert coder's own link) is a
  *label*, not a credential: anyone with the link could use it.
- **Unauthenticated work stays on its device**, unless the coder moves it
  with a one-time transfer link.

## 2. Terms

| Term | What | Where |
| --- | --- | --- |
| **Coder session** (`sessionId`) | One coder's run through a study: answers, progress. Everything is keyed by it | `coder_sessions` |
| **Device id** | A random secret the server gives a browser once, for all studies, in the httpOnly cookie `annotinder_device`. Never stored by the server | the browser |
| **Device key** | SHA-256 of device id, deployment and the crowd's coder id from the URL (if any): the device's key to its session in one study. Only this is stored, so a device's sessions in different studies can't be linked. One per device of a session | `session_devices` |
| **Coder** | Someone who codes in a study, known by their coder id: an **expert coder** (made by the researchers, with their own units) or a **crowd's** coder (made when they start) | `coders` |
| **Coder id** (`coder`) | Who the coder is: `$session.coder`, the results' `coder` column. Per study, never changed, and one coder whatever its case. Expert coders: the id the researchers gave them (the values of the units' `coder_set`). A crowd: the `coderParam` URL value (e.g. `PROLIFIC_PID`); without one a crowd's session has no coder. A label, never a credential | `coders.coder`, `coder_sessions.coder` |
| **Coder's email address** | The address an expert coder signs in with, where the study has them sign in. Given by the researchers, who can change it; not the coder id | `coders.email` |
| **Linked email** | A verified address from a login (§5), linked to the session once, to continue on other devices | `coder_sessions.email` |
| **Transfer link** | A one-time link (15 minutes) that adds another device to the session | `transfers` (token hash only) |

The system never merges sessions. Researchers who want to merge sessions of
one person group them by coder id or email in analysis.

### The study's coders

A study has expert coders or a crowd: its `coderKind` (`studies.coder_kind`),
chosen when it is made and fixed by its first deploy (`architecture.md`
§6.1). The Coders page shows the coders of that kind.

A study's coders are rows of `coders`: the coder id (key: study and coder
id; unique ignoring case), `kind` (`expert` or `crowd`), `email` (an expert
coder's, unique per study ignoring case, or none) and `created`. A session's
coder is one of them (`coder_sessions` refers to the row, and goes when it
is deleted); a session without a coder id (an anonymous link) has none.
Code: `shared/studyCoders.ts`; the researcher API is in
`api/researcher.md` (listCoders, createCoders, updateCoder, deleteCoders),
the researcher UI on the Coders page (`client.md` §7).

- **Expert coders are made by the researchers** (the Coders page's "Add
  coders", `POST /study/:studyId/coders`), before or after there are units.
  The id is 1 to 64 characters: a name, a number, an email address; no `;`
  or `#` (a `coder_set` cell's separators), no control characters, no spaces
  at its ends. An id or email address that another coder of the study has is
  refused (ignoring case), with the list.
- **The units' `coder_set` names expert coders only.** A coder set (made in
  the dialog, uploaded with units, or in a recipe) that names anyone else is
  refused, listing the unknown ids (400 `unknown_coders`): add the coders
  first. Nothing makes them on the way.
- **A crowd's coders are made when they start**: a session with a coder id
  that isn't a coder yet (`coderParam`) makes one, kind `crowd`. An id that
  differs only in case from a coder's is that coder (the session's `coder`
  is the id as first written). A crowd's id that is one of the study's
  expert coders is refused: 409 `coder_is_expert` (a study has one kind of
  coders, so this takes a study whose kind was changed before its first
  deploy, after expert coders were added); ids are never prefixed or changed
  to tell the kinds apart. A crowd's coder goes with their last session:
  when the researchers delete it (§8), and when it is removed unused (§5).
- **The id never changes; the email address can.** `PATCH
  /study/:studyId/coders/:coder { email }` sets or clears it. Signing in
  uses the address as it is now (§5); a session keeps the address it was
  started with.
- **Researchers see coders' email addresses** on the Coders page (any role
  in the study): they entered them. They are stored before a coder ever
  signs in, which the privacy statement says
  (`legal/privacy-statement.md`). Exports hold them only where the deployed
  design has coders sign in (as for sessions' addresses).

## 3. Links

Links are made by deploying: one, or one per coder for expert coders with
a link each (`architecture.md` §7). A link no longer part of the design is
retired (403 `link_inactive` for new sessions; started sessions go on). A
revoked link (403 `link_revoked`) can be reopened. The invitation
(`architecture.md` §6.1), which is for the study's kind of coders, decides
how a session starts:

| Invitation | Sign-in | The coder (`$session.coder`) |
| --- | --- | --- |
| expert coders, `per_coder` | the coder's choice | the link's coder |
| expert coders, `pick_name` | the coder's choice | the picked name (`nameDevices: "first"`: the first device's; `"any"`: picking it continues its session) |
| expert coders, `login` | required (401 `auth_required`); only the email addresses of coders in the coder set (403 `email_not_allowed`) | the coder with the login's address (`coders.email`) |
| one link (crowd) | never required; the coder's choice only where the study's owner's plan has crowd sign-in on (§5) | none, or `coderParam` (`?<param>=…`, required unless `optional: true`) |

Where the coder chooses to sign in, researchers don't see the email
(contracts `loginRequired`). One link's `maxCoders` caps its
sessions (403 `link_used_up`; the link's `maxUses`).

**Duplicate coder ids are allowed**: a coder who can't reach their first
session (§4) starts another, as can anyone holding a link with that coder id.
Each is its own session with the same `coder` (so panel redirects carry it
either way); researchers handle duplicates in analysis. What is guarded is
privacy: no session is opened by a label. There is a most: a coder id has at
most 5 sessions in a study (§4).

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
  already has a session: a crowd's `coderParam`, or a expert coder's own
  link):
  1. The server refuses to create a second session silently:
     `409 { code: "coder_has_session" }`.
  2. The client says: continue on the original device, or make a transfer
     link there. A coder who logged in there can **Log in** here: the
     notice has the button where the 409 says `canLogIn` (the server has a
     login, and the study's coders may sign in: §5), and the page they come
     back to continues the account's session.
  3. Only for a coder who can't get back (lost device, cleared browser):
     **I can't get back to my earlier session…** asks to confirm, then **Start
     a new session** retries with `x-new-session: 1` (first request only). The
     new session can't see the earlier answers.

  New sessions of a known coder don't count toward the link's maximum. This
  tells someone holding the link that the coder id was used before, nothing
  else.

  **At most 5 sessions per coder id per study** (`MAX_SESSIONS_PER_CODER`,
  `runtime/startSession.ts`): since they don't use up the link, one
  participant could otherwise fill a study with sessions. When the coder id
  has 5, a request for another (`x-new-session: 1`) gets 403
  `coder_session_limit`; the coding screen says "You can't start another
  session" and sends the coder back to the device where they started. The
  count runs under a database lock per study and coder id, so requests at
  the same time can't pass it together. Sessions without a coder id (an
  anonymous link) have no such cap: they are bounded by the link's
  `maxCoders` and the limit on new sessions per address (`security.md` §3).
- **Anonymous links on a new device** simply start a new session. A coder
  who then logs in to continue their account's session leaves it; unused,
  it is removed (§5).
- **The coder home** (`/code`) lists this browser's studies: the browser
  remembers the studies it opened (deployment and URL parameters, never a
  link secret) and asks each (`GET /d/<id>/summary`), since the server can't
  list a device's sessions. A logged-in coder also sees sessions linked to
  their email (`GET /coder/sessions`); one that isn't on this device opens
  with `?login=1`, so the login counts there (§5). Without a login, the
  home offers one (**Log in**, where the server has a login) and comes
  back to the home. It shows each study's public title, never the
  (private) study name.
- **Not built:** offering a longer-lived "continue later" link at the start
  of long studies (no PINs or passwords: easily forgotten, little gain).

## 5. Coder login

The researcher login (§7), with the same login cookie (`annotinder_session`).
A login doesn't replace the session: it **links an email to the session,
once**. After that the device key is the session as for anyone, and logging
out doesn't affect coding. Code: `runtime/requestCoder.ts`,
`DeploymentRuntime.resolveCoder`, `runtime/dbStore.ts` (`resolveCoder`),
`runtime/startSession.ts`; client `pages/CodePage.tsx`,
`session/coderSession.ts`.

- **Who must, and who may.** Sign-in is required only for expert coders
  with `link: "login"`; only there do researchers see the email a session
  signed in with (Coders › Sessions, export). Everywhere else it is the
  coder's choice (optional sign-in), and not every coder has it:
  - **expert coders** always may;
  - **a crowd's coders** only where the study's owner's limits have
    `crowdSignIn` on (`accounts.md` §3): a plan's setting, off unless set,
    so off on a fresh server's default plan. It is read from the owner
    (`studies.owner_id`; a study without one: off) when a session asks
    (`crowdSignInAllowed`, `shared/limits.ts`), so a change of plan applies
    at once. Where it is off, the server ignores a crowd coder's choice
    (`x-use-login`): no login is read, linked or looked up.
- **What a session says** (`GET /session`): `signIn`, how signing in stands
  in the study (`required`; `optional`: the server has a login and the
  study's coders may sign in; `none`, also in previews), and `canLogIn`:
  optional, the request has this study's link, and the session has no email
  yet.
- **Expert coders who sign in** are the coder whose email address
  (`coders.email`) the login has, ignoring case; `$session.coder` is that
  coder's id, never the address. The coder must be in the deployed coder
  set; any other login gets 403 `email_not_allowed`. They have one session
  each, found by the coder (not by the address): after the researchers
  change a coder's address, the new address continues that coder's session
  and the old one has no access. Deploying checks that every coder with
  units has an address (`architecture.md` §8.4).
- **When a login counts**: only where the deployed design requires sign-in,
  or the coder chose to code with their account (the request has
  `x-use-login: 1`). A login that is just there in the browser is left out:
  a researcher who opens a coder link, or a coder who logged in for another
  study, gets a session without an email, and a second link in that browser
  (another panel id) starts its own session.
- **How a coder chooses.** Three places send the browser to the study's
  page with `login=1` in the address: **Log in** under "Continue on another
  device" (shown with `canLogIn`: "Sign in to continue from any device. The
  researchers don't see your email address.") and on the notice "You
  already started on another device" (the
  login's return address, `logInWithAccount`: `coderLoginUrl({ useLogin:
  true })`), and a study of the login on another device in the coder
  home's list (`continueUrl`). The page reads `login=1` once, takes it out of the
  address (a copied link never carries the choice to someone else), and
  sends `x-use-login: 1` while it stays open. After that the session has
  its email and the device its session, so nothing needs the header.
  `login` is one of the link's own query names, with `link` and `transfer`:
  a design can't use them as the key of a URL parameter or as `coderParam`
  (contracts `RESERVED_URL_KEYS`; "'login' is part of every study link
  (link, transfer, login): use another key").
- **When a login is read**, where it counts: only while the session has no
  email and the request has a link of this study, or on a device without a
  session in this study. Never while coding, never in previews. Another
  study's link doesn't link a session here.
- **Required**: without a login 401 `auth_required`; the client offers the
  login and comes back to the same page. An address that isn't a coder's in
  the coder set gets 403 `email_not_allowed`. "Continue on another device"
  says to sign in on the other device, with the session's address.
- **Optional**: logging in from the offer (`canLogIn`) links the email.
- **A device that joined by a transfer link** has no link of the study, so
  its login can't be linked to the session; what logging in there brings is
  the coder's own settings (theme, keys: `GET /coder/settings`). While its
  browser isn't logged in, and signing in is possible in the study (`signIn`
  not `none`), the coding screen shows one line: "Sign in here too to use
  your saved settings", with **Log in** (a plain login that comes back to
  the page; `SignInHereLine`).
- **Another device**: on a device without a session in this study, a login
  that counts finds the email's session and adds the device, also without
  the link. A login whose email has a session in the study is also enough
  for the server to load the study for the request (`Deployments.admit`,
  `api/coder.md`), e.g. after a restart; so is a login whose address is now
  that of an expert coder who has a session (the researchers changed the
  coder's address since the session started, which keeps the old one).
- **One session per email per study**: a device that started its own session
  and then logs in continues the email's session instead. Nobody can get
  back to the session it left (no device, no email). If the coder answered
  nothing in it (what a second device starts on an anonymous link, before
  the coder can log in) it is removed, and its link gets its place back
  (`maxCoders`); with answers it stays, for the researcher
  (`removeIfUnused`, `runtime/startSession.ts`). A crowd's coder whose only
  session that was is removed with it (`forgetCrowdCoders`).
- **The login cookie** is sent again when a coder's request extended the
  login session (§7; `loginReader`, `runtime/requestCoder.ts`): on the
  coder home, and on a study's routes where the login is read.
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
  in an httpOnly cookie, its hash in `sessions`, 14 days, sliding: a request
  extends the session (at most once an hour), and the server then sends the
  cookie again (coder routes too, §5), so a browser stays logged in until 14 days without use. Requests
  need `x-annotinder: 1` (CSRF). Provider tokens aren't kept. Logging out
  (`POST /auth/logout`) ends our session, not the provider's.
- **A new login ends the one it replaces.** Coming back from the provider
  (`/api/auth/callback`, also for a step-up login), the server deletes the
  session of the login cookie the browser had, so it stops working at once
  instead of after 14 days. At every login it also deletes all sessions
  that have expired (`deleteExpiredSessions`, `shared/sessions.ts`), and
  the server does so every hour (`sweepExpiredSessions`, started in
  `index.ts`), so an expired session's row stays an hour at most.
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

**Researcher side** (Coders › Sessions): open requests come first, with *Delete now*
or *Delete later* (`POST /study/:studyId/sessions/:id/deletion-request/postpone`
sets `postponedAt`; the request stays until the data is deleted). Declining
isn't a button: that is for the researcher's protocol. Any coder's data can be
deleted (`POST /study/:studyId/coders/delete { sessionIds?, coders?, emails? }`,
ADMIN): the sessions (device keys, coder id, the request) and all their
answers, also retired ones, and the study's stored results downloads (a file
made before holds the answers; a download link for it stops working). Unit
versions stay. It is a sensitive action (`security.md` §1). A deleted
coder's browser later starts a new session from its link.

**Deleting a coder** (the Coders page's row action; the same request by
coder id, or by the email address the researchers gave) removes more than
the sessions (`removeCoders`, `shared/coderDeletion.ts`):

- the coder's row, with their email address;
- every session of theirs and its answers, as above;
- their set in the units' `coder_set`, in the draft **and** as deployed: the
  units have no coder from that moment (the runtimes read the sets again).
  The Coders, Units and Deploy pages say how many units have none; the
  researcher divides them again (Make coder set) and deploys the units;
- their own link (expert coders with a link each), which is deleted (its
  sessions are gone): 404 `link_not_found` for anyone who has it.

The coder id can be made again afterwards: a new coder, without the earlier
one's units, sessions or address, who gets a new link (another secret) when
the units are deployed with them in the coder set. By session id an
expert coder stays, with their units. A crowd's coder goes with their last
session, so nothing of them is left.

Every deletion is logged (`session_deletions`: session id, coder id,
requested, deleted, by whom, answer count), so the researcher can
also delete the coder from earlier downloads (`GET /study/:studyId/coders/deletions`,
Coders › Sessions, `deleted_coders.csv`). It lists no units. The log holds no
email address of the coder:

- the session's email (`coder_sessions.email`, from signing in) and the
  coder's (`coders.email`) are not copied to it;
- a coder id that looks like an email address (a panel's id, or an id the
  researchers chose) is kept as `sha256:<hash>`: the SHA-256 of the address
  in lower case, in hex (`loggedCoder`, `shared/coderDeletion.ts`). It names
  nobody, and still finds the coder in results downloaded earlier: hash the
  coder ids there the same way and compare. In R:
  `paste0("sha256:", digest::digest(tolower(coder), algo = "sha256", serialize = FALSE))`.
- any other coder id (a panel id, a name the researcher gave) is kept as it
  is.

`deletedBy` is the researcher's address. The export's `sessions.csv` also has `ended` = `quit`
and a `deletion_requested` column.

## 9. Closing finished sessions

A session that ended (an `end` item, finishing the study, or quitting) is
**closed** unless the study keeps sessions open (`studies.reopen_minutes`
null; the first deploy suggests this for coder links, and a day for one link). So finished data won't change, and someone who later gets
into a coder's login or device doesn't see their answers.

- A closed session gets only what its end screen shows: `GET /session`
  returns `endValues` (the answers and unit fields the end message and
  redirect mention) and no other `variables`; `getLoopUnit` answers 409
  `session_closed`.
- Finishing without an `end` item also ends the session (`POST /end` without
  an item, outcome `complete`).
- **Going back**: after completing (not after a screen-out, quitting or a
  deletion request) the coder can go back within the study's reopen time
  (`reopen_minutes`, counted from when they last finished; always if the
  study keeps sessions open): `POST /reopen`. Going back opens the session
  again; nothing counts down while it is open. `reopen` in `POST /end`'s
  response and in `GET /session` says until when.
- **New units**: when a coder got units since they last loaded the session
  (the researcher added units or moved units to them, and deployed),
  `GET /session` says how many (`newUnits`, with the deployment's
  `newUnitsMessage`), once. A finished session that can still be reopened
  is opened again for them, so they code the new units.

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
