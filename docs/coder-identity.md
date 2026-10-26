# Coder identity, sessions and auth

Status: draft v1 (2026-10-10; updated 2026-10-26 for the single server).
The "coder key / transfer link / participant id" part is implemented.
Authentication (§5) is designed but not yet built. Complements
`docs/architecture.md`.

## 1. Principles

- **The server verifies who a coder is, and decides whether they get in**
  (the invite's rules). It doesn't manage coder accounts: identity comes
  from a login provider or a link.
- **Only authentication unlocks earlier work from another device.** An id
  that comes from a link (a participant id in a survey URL, or one hidden in
  a personal invite) is a *label*, not a credential. Anyone holding the link
  could use it. So it never gives access to earlier annotations.
- **Unauthenticated work stays on the device it was done on**, unless the
  coder explicitly moves it with a one-time transfer link, or (where the
  server sends email) a recovery link the server mails to the coder.
- **For encrypted jobs** (on hold, `docs/encryption.md`), login was only
  access control; moving a session took a transfer or recovery link.

## 2. Terms

| Term | What it is | Where it lives |
| --- | --- | --- |
| **Coder** (`coderId`) | One annotation session in a job: a set of answers, unit assignments and progress. Everything (annotations, routing, distribution) is keyed by `coderId`. Shown to coders as "your session". | database |
| **Session key** | Random secret, created by the server, that unlocks one coder without login. Kept in an httpOnly cookie, so page scripts never see it. It is a *key*, not an id: it moves with a transfer, so it isn't a device id. | the coder's browser (httpOnly cookie) |
| **Coder key** | What the database stores to find the coder: the SHA-256 of the session key, so a database leak doesn't hand out sessions. | database |
| **Participant id** | External label from the researcher or a panel company, e.g. a Prolific/Qualtrics participant id. It is fixed in a personal invite, or taken from the `participant` URL parameter. Never a credential. | database (on the coder) |
| **Verified identity** | `{ provider, subject, email? }` from a login (§5). The only thing that lets a coder resume from another device. | database (on the coder) |
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
| **participant id** (`participantId` fixed on the invite, or `participantFromUrl: true` + `?participant=…`) | new session, labelled with the participant id | login first; the participant id is a label next to the identity |

`optional` lets the coder choose: log in to be able to resume elsewhere, or
continue anonymously. `emails` (an allowlist) and `maxUses` further
restrict an invite.

## 4. Sessions without login (implemented)

- **First visit.** The server creates a random session key and, once it
  accepted the coder (an invite, stored with the key's hash), sets it as a
  cookie: `HttpOnly`, `SameSite=Lax`, `Secure` over https,
  `Path=/d/<jobId>`, 400 days. The cookie name includes a hash of
  the participant id (sent by the client as a header, from the URL), so a
  shared lab computer keeps separate sessions per participant. The invite
  isn't part of it: everything the job needs from the invite and the URL
  (preset and `url_param` variables) is stored when the coder starts, so
  the invite and URL details can be forgotten. The client never sees or
  stores the key.
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

## 5. Authentication (designed, not built)

A verified identity replaces the coder key as the credential. Methods, in
order of value for effort:

1. **Assertion from another system.** A system with its own login (e.g.
   AmCAT) signs a short JWT `{ job, coderId | subject, exp }` that the
   server accepts. No second login for coders. Cheapest to build.
2. **OIDC.** One generic implementation, configured per provider:
   - Google and Microsoft (many universities);
   - ORCID;
   - SURFconext / eduGAIN for Dutch and EU institutions.

   No per-login cost.
3. **Email one-time code or magic link.** The only method with running
   costs and abuse risk. It is limited to invites with an `emails`
   allowlist, so the server never mails arbitrary addresses and volume
   is bounded by what researchers invited. Add rate limits per address and
   per invite. Each deployment configures its own email provider (SES,
   Resend, SMTP), so costs land on the job that uses it.

**Flow.**

1. The server verifies the identity.
2. It checks the invite rules (allowlist, `maxUses`), and finds the
   existing coder for that identity in this job, or creates one.
3. It issues a short-lived signed session token
   `{ deployment, coderId, exp }`. Sessions are stateless; nothing is stored.

Emails are stored with the coder, never shown to other coders.

**Recovery links** (optional, not built): where the server sends email, a
coder can ask "send me a recovery link". It moves the session to the device
that opens it, like a transfer link. (`docs/encryption.md` had a design
that also carries an encryption key; on hold since the merge.)

Until this exists, `auth: "required"` invites are refused with
`401 { code: "auth_required" }`.

## 6. Open points

- **Revoking a transfer.** Should "move this session" (revoke the old
  device's key) exist next to "copy"? Probably only once there is a reason;
  with a login, the identity is the thing to revoke instead.
- **A long-lived "continue later" link** (§4, "Offer the link early"):
  stored in the database (server memory isn't durable), one per
  session, revocable from the device that has the session. Should it be
  single use (each redeem makes a new one)?
- **Duplicate work across sessions of one participant.** Dynamic sources
  count codings per coder, so two sessions of one person can code the same
  unit. Possible later: optionally treat sessions with the same participant
  id as one person for distribution.
