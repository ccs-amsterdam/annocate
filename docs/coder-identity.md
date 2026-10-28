# Identity, sessions and login

Status: current (2026-10-28). Coder sessions without login (§4),
coder login (§5) and researcher login (§7) are implemented.
Complements `docs/architecture.md`.

## 1. Principles

- **A login provider proves who someone is; the server decides whether they
  get in** (job roles, the invite's rules). The server keeps no passwords:
  identity is a verified email address from the provider (§7).
- **Only authentication unlocks earlier work from another device.** An id
  that comes from a link (a participant id in a survey URL, or one hidden in
  a personal invite) is a *label*, not a credential. Anyone holding the link
  could use it. So it never gives access to earlier annotations.
- **Unauthenticated work stays on the device it was done on**, unless the
  coder explicitly moves it with a one-time transfer link.

## 2. Terms

| Term | What it is | Where it lives |
| --- | --- | --- |
| **Coder** (`coderId`) | One annotation session in a job: a set of answers, unit assignments and progress. Everything (annotations, routing, distribution) is keyed by `coderId`. Shown to coders as "your session". | database |
| **Device id** | Random secret the server gives a browser once, for all jobs, in an httpOnly cookie (`annotinder_device`), so page scripts never see it. Never stored by the server. | the coder's browser (httpOnly cookie) |
| **Device key** | A device's key for its session in one job: SHA-256 of device id, deployment and participant id. The database stores only this, so nothing links one device's sessions across jobs. A session has one per device that joined it. | database (`coder_devices`) |
| **Participant id** | External label from the researcher or a panel company, e.g. a Prolific/Qualtrics participant id. It is fixed in a personal invite, or taken from a URL parameter the invite names (`participantParam`, e.g. `PROLIFIC_PID`). Never a credential. | database (on the coder) |
| **Linked email** | A verified email address from a login (§5), linked to the session once. Lets the coder continue on another device by logging in there. | database (`coders.email`) |
| **Transfer link** | One-time, short-lived link that adds another device to the session. | server memory (15 min) |

Every coder (session) has one or more device keys. Some also have a
participant id; some also have a linked email. For
analysis, researchers group coders by participant id or email when they want
to merge sessions of the same person. The system itself never merges
sessions.

## 3. Invitations

Two independent settings:

|  | `auth: "none"` | `auth: "required"` (or `"optional"`) |
| --- | --- | --- |
| **no participant id** | anyone with the link starts a new session | login first; the same login resumes the same coder on any device |
| **participant id** (`participantId` fixed on the invite, or `participantParam: { param, pattern? }` + `?<param>=…`) | new session, labelled with the participant id | login first; the participant id is a label next to the identity |

`optional` lets the coder choose: log in to be able to resume elsewhere, or
continue anonymously. `emails` (an allowlist; it makes login required) and
`maxUses` further restrict an invite.

**Duplicate participant ids** are allowed: a participant who can't reach
their first session (§4) starts another, and so does anyone else holding a
link with a fixed participant id. Each is its own coder with the same
`participant_id` (and `$session.participant`, so end redirects to a panel
carry it either way); researchers deal with duplicates in analysis. The
risk guarded against is privacy (no session is opened by a label), not
confusion at a panel company over a leaked link.

## 4. Sessions without login (implemented)

- **The device id.** A browser gets one random device id, the first time
  an invite accepts it, in a cookie: `annotinder_device`, `HttpOnly`,
  `SameSite=Lax`, `Secure` over https, `Path=/d`, 400 days. One cookie for
  all jobs, so cookies don't pile up for coders who do many jobs.
- **The session in a job.** The server derives the device's key for a job
  on every request: SHA-256 of device id, deployment and participant id (the
  server reads the participant id from the URL parameters the client sends,
  `x-url-params`, using the invite's `participantParam`; cached per invite
  for a minute). Including the participant id keeps participants apart on
  a shared lab computer. The database stores only the key, in
  `coder_devices` (one row per device of a session), never the device id:
  sessions of one device in different jobs can't be linked from stored
  data. The device id is long and random, so no secret is needed (rotating
  `ANNOTINDER_SECRET` logs no coder out). Each request finds the session
  by its key: one indexed query. Everything the job needs from the invite and the URL
  (preset and `url_param` variables, the participant id and the invite's
  other required URL parameters) is stored when the coder starts, so the
  invite and URL details can be forgotten.
- **Device details.** When a device joins a session, coarse details from
  its user agent are stored with it: device type (phone, tablet, desktop),
  browser and operating system (`shared/devices.ts`), not the user agent
  itself. Each answer records the device it was given on
  (`annotation_values.device_id`); researchers get them with
  `GET /job/:jobId/devices` and in the export (`devices.csv`).
- **Required URL parameters.** An invite can require URL parameters: the
  participant id's (`participantParam`) and others (`urlParams: [{ param,
  name?, pattern? }]`, e.g. a panel's study and session ids). A new session
  without one, or with a value that doesn't match its pattern (a regular
  expression, matched in full), is refused (400 `url_param_missing` /
  `url_param_invalid`), so a broken panel link shows at once. The values are
  stored on the coder (`coders.session`) and are the codebook's `$session`
  values: `$session.participant` and `$session.<name>` (`name`, else the
  parameter's own name, which must then be a valid name). They belong to
  the invitation, not the codebook, so validation can't check the names
  (unknown ones are empty); codebook-level values from the URL stay
  `url_param` auto variables.
- **Same device later.** The device cookie resumes the same coder, whatever
  link (or none) the coder comes back with, as long as it carries the same
  participant id (a participant link with another id is another session).
- **CSRF.** Every coder API request must carry `x-annotinder: 1`, which a
  cross-site form or image can't send, and the coder API sends no CORS
  headers, so cross-origin scripts can't either. This relies on the client
  and the server sharing an origin (in dev: Vite proxies `/d/`).
- **Another device.** On the device that has the session, the coder opens
  "Continue on another device":
  1. `POST /d/:deployment/transfer` returns a one-time token, valid for
     15 minutes.
  2. The client shows it as a link and a QR code.
  3. Opening the link on the new device calls
     `POST /d/:deployment/transfer/redeem`, which adds that device to the
     session: its keys for this job (without a participant id, as the
     transfer link carries none, and with the session's participant id, for
     when it comes back with the participant's link). Both devices can now
     continue the same session.

  Tokens live only in server memory. That fits the "nothing that can't
  be rebuilt" rule (`architecture.md` §3): losing them means making a new
  link.
- **Offer the link early** (not built). Switching devices halfway is rare
  (panel participants finish in one sitting), so "Continue on another
  device" stays in the menu. For long jobs, the client also offers it once
  at the start: "Want to finish later on another device? Save this link."
  It is optional and asks nothing of the coder. It needs a link that stays
  valid longer than a 15-minute transfer token (e.g. a long-lived transfer
  token stored in the database, revocable); open point.
  We don't add PINs or passwords: forgotten easily, and little gain over a
  link.
- **A participant link opened on a new device** (no cookie, and that
  participant already has a session):
  1. The server refuses to silently create a second coder. It answers
     `409 { code: "participant_has_session" }`.
  2. The client explains: "continue on the original device, or make a
     transfer link there".
  3. The client also offers **Start a new session**. That retries with
     `x-new-session: 1` (first request only) and creates a new coder with
     the same participant id, for this device. The new coder cannot see
     the earlier annotations.

  New sessions of a known participant don't count toward the invite's
  `maxUses`.

  Privacy note: this tells someone holding the link that the participant
  id was used before. They learn nothing else.
- **Anonymous links on a new device** simply start a new session. There is
  nothing to detect.

## 5. Coder login (implemented, 2026-10-28)

The researcher login (§7) for coders: the same provider and the same
login cookie (`annotinder_session`, path `/`). A login doesn't replace the
coder's session: it **links an email to the session, once**. After that,
the device key (§4) is the session as for anyone, and logging out of
AnnoTinder doesn't affect coding. The email is used again only to continue
on another device. Code: `coder.ts` (the session middleware),
`DeploymentRuntime.resolveCoder`, `runtime/store.ts` (`findOrCreateCoder`).

- **When a login is read.** Only when it matters: on invites with
  `auth: "optional"` or `"required"` (or an `emails` list) while the
  session has no email yet, and on a device without a session in this job
  (to find the email's session). A session with an email, or on an invite
  without login, never looks at the login: no lookups while coding. An
  invite with `auth: "none"` ignores a login (a researcher trying their own
  link starts an anonymous session). Never in previews.
- **Required.** `required` (or an `emails` list) without a login: 401
  `auth_required`; the client offers the login, which comes back to the same
  page, and the new session gets the email. A login not on the `emails`
  list: 403 `email_not_invited`.
- **Optional.** `GET /session` says `canLogIn` (the server offers a login,
  the invite is `optional`, the session has no email). Logging in links the
  email to the session on this device.
- **Another device.** Logging in on a device without a session in this job
  finds the email's session and adds the device to it (as a transfer link
  does). This also works without the invite link.
- **One session per email in a job.** If the email already has a session in
  this job, a device that started its own and then logs in continues the
  email's session instead (its own stays, unlinked).
- **Accounts.** Logging in creates a user (`users`) as for researchers,
  with the account role `user` (`accounts.md`).

Possible later: a system with its own login (e.g. AmCAT) vouches for a
coder with a short signed assertion `{ job, subject, exp }`, so coders don't
log in twice.

## 6. Open points

- **Removing a device.** A session's devices each have their own key, so a
  device could be removed from a session (e.g. a lost phone). Not built:
  no reason yet.
- **"My jobs".** A list of the jobs a device or account took part in. If
  wanted, the device's list lives in the browser only (the server can't
  link a device's jobs, on purpose); an account's would be the sessions
  linked to its email.
- **A long-lived "continue later" link** (§4, "Offer the link early"):
  stored in the database (server memory isn't durable), one per
  session, revocable from the device that has the session. Should it be
  single use (each redeem makes a new one)?
- **Duplicate work across sessions of one participant.** Shared queues
  count codings per coder, so two sessions of one person can code the same
  unit. Possible later: optionally treat sessions with the same participant
  id as one person for distribution.

## 7. Researcher login (implemented, 2026-10-26)

Code: `server/src/oidc.ts`, `researcher/login.ts`, `shared/sessions.ts`;
client `components/admin/account/`. Endpoints: `docs/api/researcher.md`.

- **A login provider proves who someone is; the session is ours.** Any
  OpenID Connect provider, configured by its issuer URL (e.g. a self-hosted
  Authentik that handles social logins and email magic links). The server
  runs the authorization code flow with PKCE itself (`/auth/login`,
  `/auth/callback`), so tokens never reach the browser, checks the ID token,
  and starts its own session: a random key in an httpOnly cookie, its hash
  in the `sessions` table, 14 days, sliding. Every request with the cookie
  needs the `x-annotinder: 1` header (CSRF), as on the coder API. The
  provider's tokens are not kept: we never call it on the researcher's
  behalf. Logging out ends our session (`POST /auth/logout`), not the
  provider's.
- **Identity is the verified email address.** The provider MUST verify
  email addresses: a login without `email_verified: true` is refused. The
  user is found or created by their (lowercased) email; `sub` is not used.
  So switching or adding providers keeps everyone's account, and logging in
  with Google and with a magic link for the same address is the same user.
  Roles in jobs (`job_users`) and API keys belong to that user.
- **Accepted risk: whoever controls the mailbox controls the account.** That
  holds for any system with email login or email recovery. A recycled
  address (an institution giving an old address to someone new) inherits
  its previous owner's job roles. Job admins see who has a role and can
  remove it.
- **Two-factor authentication is recommended; a server can require it.**
  `ANNOTINDER_REQUIRE_MFA=1` requires a login whose ID token `amr` claim
  names a second factor for managing jobs and the server; logging in and
  coding work without (`accounts.md` §5).
- **Account roles** (user, researcher, admin), who becomes a researcher,
  and limits: `accounts.md`.
- **Setting up a provider** (e.g. Authentik):
  - redirect URI `<ANNOTINDER_PUBLIC_URL>/auth/callback`, scopes `openid
    email`, a confidential client (client id and secret);
  - `email_verified` must reflect a real check (social logins whose
    provider verified the address, magic links after the link was opened);
  - a social login source may only be linked to an existing user by email
    if that source verifies addresses (Authentik's "user matching mode"
    warns about this);
  - with 2FA: losing a second factor must not be recoverable by email alone,
    or a mailbox is enough after all.
- **Not built:** a list of active sessions, logging out everywhere, logout
  at the provider (`architecture.md` §10).


## 8. Quitting, and deleting a coder's data (implemented, 2026-10-28)

Coders can always leave; their data can be deleted; nothing is deleted by
accident or as a way to undo paid work.

**Coder side** (the door icon in the coding screen, `QuitMenu.tsx`):

- *Stop for now*: nothing changes on the server. The dialog explains how to
  continue: the same link on the same device and browser (§4), or a
  transfer link first.
- *Quit this job*: `POST /quit` ends the session (`ended: { outcome:
  "quit", at }`, no item); answers so far are kept.
- *Quit and ask to delete my answers*: `POST /quit { requestDeletion: true
  }` also records `coders.deletion_request = { at }`. The coder types a
  word to confirm. It works after the session ended too (the end screen
  offers it), and isn't offered in previews.

A request, not a deletion: AnnoTinder can't know whether the researcher
already holds the data elsewhere, and immediate deletion would let a paid
participant finish, get paid and withdraw the work. The request needs no
proof of identity: it comes from the session itself. Coders without a
participant id or login can't be identified otherwise.

**Researcher side** (Coders tab): open requests are listed first, with
*Delete now* or *Delete later* (`POST /job/:jobId/coders/:id/deletion-request/postpone`:
`postponedAt` is added; the request is no longer brought up but stays, and
the row stays marked, until the data is deleted). Declining isn't offered:
whether research data is exempt is for the researcher's protocol, not a
button. Any coder's data can
be deleted (`POST /job/:jobId/coders/delete { coderIds?, participantIds?,
emails? }`, ADMIN): the coders rows (device keys, participant id, coder-level
answers, routing, the request) and all their `annotation_values`, also
retired ones; `units.coded` is recomputed. Unit versions stay (unit content).
The deployment's runtime is dropped and loads again (it caches coders,
codings and routing). A deleted coder's browser later starts a new session
from its invite. Every deletion is logged (`coder_deletions`: coder id,
participant id, email, requested, deleted, by whom, answer count), so the
researcher can delete the coder from earlier downloads too
(`GET /job/:jobId/coders/deletions`, the Coders tab, and
`deleted_coders.csv` in the export).

The export has `ended` = `quit`, a `deletion_requested` column (when the
coder asked, while not yet deleted) and `deleted_coders.csv`.

Open: what GDPR requires for anonymous participants (no identifier at all)
is for the researcher's protocol; AnnoTinder offers the request from the
session and deletion by participant id or email.

## 9. Closing finished sessions (implemented, 2026-10-28)

A session that ended (an `end` item, finishing the job, or quitting) is
**closed** unless its job keeps sessions open (`jobs.keep_sessions_open`,
off by default; job settings). So researchers can trust finished data
won't change, and someone who later gets into a coder's login or device
doesn't get their answers.

- A closed session gets only what its end screen shows: `GET /session`
  returns `endValues` (the coder-level answers, and with an end inside a
  unit loop the unit's fields and answers, that the end message and
  redirect link mention) and no other `variables`; `getLoopUnit` answers
  409 `session_closed`.
- Finishing without an `end` item also ends the session now (`POST /end`
  without an item, outcome `complete`); before, only the client knew.
- **Going back**: after completing (not after a screenout, quitting or
  asking for deletion), the coder can go back for 15 minutes
  (`REOPEN_MS`; always, if the job keeps sessions open): `POST /reopen`
  opens the session again and the client lands on the last question.
  `reopen` in `POST /end`'s response and in `GET /session` says whether and
  until when.

Not done, on purpose: limiting how far back coders can go *during* a
session. Coder-level answers are needed in the browser anyway (conditions
and branching use them), so hiding earlier screens would protect little;
a login with a second factor, or no login, does more for a half-finished
session.

## 10. Response times (implemented, 2026-10-28)

Always on: how long coders take per question, for analysis (e.g. reading
time per unit) and for spotting bad faith (clicking through). Not shown in
the UI yet; in the download (`timings.csv`, and per unit in
`annotations.csv`). Mentioned on the privacy help page.

- **The browser measures, per question** (`client/src/lib/jobManager/timing.ts`,
  `AnswerTimingSchema`): the time until its first answer (`firstMs`), on
  screen over all visits (`totalMs`), with the page hidden (`hiddenMs`:
  another tab, a minimized window; apart from `totalMs`), and how often
  the answer changed (`edits`). Waiting for the server isn't counted. Sent
  with the answers (`timings` in `POST /variables/unit` and
  `/variables/coder`) and stored on the answer row
  (`annotation_values.timing`); a coder-level answer looked at again but
  not changed gets only its timing updated.
- **The server's bound**, since a browser can be tampered with: per coder
  and unit, when the server first handed the unit out (`unit_serves`,
  `servedAt` in `listAnnotations`); a unit's answers arrive together, so
  from then to the last answer bounds the time on all its questions.
  Coder-level answers are posted one at a time, so the time since the
  coder's previous answer bounds each. The download flags browsers that
  claim more time than the server saw (`exceeds_server`; 2 s leeway).
  The bound only catches inflated times; too-fast answers show in the
  server's times themselves.
- Later: inspecting times per unit and question, distributions, flags for
  likely fraud.
