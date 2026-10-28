# Identity, sessions and login

Status: current (2026-10-26). Coder sessions without login (§4) and
researcher login (§7) are implemented; coder login (§5) is planned.
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
| **Session key** | Random secret, created by the server, that unlocks one coder without login. Kept in an httpOnly cookie, so page scripts never see it. It is a *key*, not an id: it moves with a transfer, so it isn't a device id. | the coder's browser (httpOnly cookie) |
| **Coder key** | What the database stores to find the coder: the SHA-256 of the session key, so a database leak doesn't hand out sessions. | database |
| **Participant id** | External label from the researcher or a panel company, e.g. a Prolific/Qualtrics participant id. It is fixed in a personal invite, or taken from a URL parameter the invite names (`participantParam`, e.g. `PROLIFIC_PID`). Never a credential. | database (on the coder) |
| **Verified identity** | A verified email address from a login (§5, §7). The only thing that lets a coder resume from another device. | database (users) |
| **Transfer link** | One-time, short-lived link that copies a session key to another device. | server memory (15 min) |

Every coder has a session key, or a verified identity once auth exists. Some
also have a participant id; some also have a verified identity. For
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
continue anonymously. `emails` (an allowlist) and `maxUses` further
restrict an invite.

## 4. Sessions without login (implemented)

- **First visit.** The server creates a random session key and, once it
  accepted the coder (an invite, stored with the key's hash), sets it as a
  cookie: `HttpOnly`, `SameSite=Lax`, `Secure` over https,
  `Path=/d/<jobId>`, 400 days. The cookie name includes a hash of
  the participant id (the server reads it from the URL parameters the
  client sends, `x-url-params`, using the invite's `participantParam`;
  cached per invite for a minute), so a shared lab computer keeps separate
  sessions per participant. The invite isn't part of it: everything the job
  needs from the invite and the URL (preset and `url_param` variables, the
  participant id and the invite's other required URL parameters) is stored
  when the coder starts, so the invite and URL details can be forgotten.
  The client never sees or stores the key.
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
- **Same device later.** The cookie resumes the same coder, whatever link
  (or none) the coder comes back with.
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
     `POST /d/:deployment/transfer/redeem`, which sets the session cookie
     there. Both devices can now continue the same session.

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
     the same participant id; the server sets a new cookie. The new
     coder cannot see the earlier annotations.

  New sessions of a known participant don't count toward the invite's
  `maxUses`.

  Privacy note: this tells someone holding the link that the participant
  id was used before. They learn nothing else.
- **Anonymous links on a new device** simply start a new session. There is
  nothing to detect.

## 5. Coder login (planned)

As researcher login (§7): the same OpenID Connect provider (which handles
social logins and email magic links), identity by verified email, and our
own session. For coders:

1. An invite with `auth: "required"` (or `"optional"`, if the coder
   chooses) sends the coder to log in first.
2. The server checks the invite's rules: `emails` (an allowlist), revoked,
   `maxUses`.
3. It finds the coder for that user in this job, or creates one, and sets
   the coder session cookie (§4) for it. The same login on another device
   finds the same coder: that is how logged-in coders resume anywhere.

The coder record links to the user; emails are never shown to other
coders. Until this exists, `auth: "required"` invites are refused with
`401 { code: "auth_required" }`.

Possible later: a system with its own login (e.g. AmCAT) vouches for a
coder with a short signed assertion `{ job, subject, exp }`, so coders don't
log in twice.

## 6. Open points

- **Revoking a transfer.** Should "move this session" (revoke the old
  device's key) exist next to "copy"? Probably only once there is a reason;
  with a login, the login is the thing to use instead.
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
- **Two-factor authentication is recommended, not required.** It is the
  researcher's own responsibility; the login screen says so, especially for
  jobs with sensitive data. A server can require it: `OIDC_REQUIRE_MFA=1`
  refuses logins whose ID token `amr` claim names no second factor.
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
*Delete their data* or *Decline* (`POST /job/:jobId/coders/:id/deletion-request/decline`:
`declinedAt` is added; the request stays on record). Any coder's data can
be deleted (`POST /job/:jobId/coders/delete { coderIds?, participantIds?,
emails? }`, ADMIN): the coders rows (session key, participant id, coder-level
answers, routing, the request) and all their `annotation_values`, also
retired ones; `units.coded` is recomputed. Unit versions stay (unit content).
The deployment's runtime is dropped and loads again (it caches coders,
codings and routing). A deleted coder's browser later starts a new session
from its invite.

The export has `ended` = `quit` and a `deletion_requested` column (`open` or
`declined`).

Open: what GDPR requires for anonymous participants (no identifier at all)
is for the researcher's protocol; AnnoTinder offers the request from the
session and deletion by participant id or email.
