# Coder identity, sessions and auth

Status: draft v1 (2026-10-10). The "coder key / transfer link / participant
id" part is implemented. Authentication (§5) is designed but not yet built.
Complements `docs/architecture.md`.

## 1. Principles

- **The job server handles auth for coders only, and only to verify
  identity.** Researcher and admin auth stays with each db server, which
  usually has its own. Even for coders, the job server never manages
  accounts. It proves who someone is, and the db server decides whether
  they get in.
- **Only authentication unlocks earlier work from another device.** An id
  that comes from a link (a participant id in a survey URL, or one hidden in
  a personal invite) is a *label*, not a credential. Anyone holding the link
  could use it. So it never gives access to earlier annotations.
- **Unauthenticated work stays on the device it was done on**, unless the
  coder explicitly moves it with a one-time transfer link.

## 2. Terms

| Term | What it is | Where it lives |
| --- | --- | --- |
| **Coder** (`coderId`) | One annotation session in a job: a set of answers, unit assignments and progress. Everything (annotations, routing, distribution) is keyed by `coderId`. Shown to coders as "your session". | db server |
| **Coder key** | Random secret, created on the device, that unlocks one coder without login. It is a *key*, not an id: it moves with a transfer, so it isn't a device id; and it is a credential, so it isn't a session id. Sent as `x-coder-key`. | the coder's device (localStorage) + db server |
| **Participant id** | External label from the researcher or a panel company, e.g. a Prolific/Qualtrics participant id. It is fixed in a personal invite, or taken from the `participant` URL parameter. Never a credential. | db server (on the coder) |
| **Verified identity** | `{ provider, subject, email? }` from a login (§5). The only thing that lets a coder resume from another device. | db server (on the coder) |
| **Transfer link** | One-time, short-lived link that copies a coder key to another device. | job server memory (15 min) |

Every coder has a coder key, or a verified identity once auth exists. Some
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

- **First visit.** The client creates a random coder key and stores it on
  the device. The storage scope is job server URL + deployment + invite +
  participant id. So a shared lab computer keeps separate sessions per
  invite or participant. The first request creates the coder (db server,
  via the job server's `coders/resolve`).
- **Same device later.** The stored key resumes the same coder.
- **Another device.** On the device that has the session, the coder opens
  "Continue on another device":
  1. `POST /d/:deployment/transfer` returns a one-time token, valid for
     15 minutes.
  2. The client shows it as a link and a QR code.
  3. Opening the link on the new device calls
     `POST /d/:deployment/transfer/redeem`, which returns the coder key.
     Both devices can now continue the same session.

  Tokens live only in job-server memory. That fits the "nothing that can't
  be rebuilt" rule (`architecture.md` §3): losing them means making a new
  link.
- **A participant link opened on a new device** (no stored key, and that
  participant already has a session):
  1. The db server refuses to silently create a second coder. The job server
     answers `409 { code: "participant_has_session" }`.
  2. The client explains: "continue on the original device, or make a
     transfer link there".
  3. The client also offers **Start a new session**. That retries with
     `x-new-session: 1` and creates a new coder with the same participant
     id. The new coder cannot see the earlier annotations.

  New sessions of a known participant don't count toward the invite's
  `maxUses`.

  Privacy note: this tells someone holding the link that the participant
  id was used before. They learn nothing else.
- **Anonymous links on a new device** simply start a new session. There is
  nothing to detect.

## 5. Authentication (designed, not built)

A verified identity replaces the coder key as the credential. Methods, in
order of value for effort:

1. **Db server assertion.** A db server with its own login signs a short JWT
   `{ job, coderId | subject, exp }` that the job server accepts. No second
   login for coders. Cheapest to build.
2. **OIDC.** One generic implementation, configured per provider:
   - Google and Microsoft (many universities);
   - ORCID;
   - SURFconext / eduGAIN for Dutch and EU institutions.

   No per-login cost, and it works on Cloudflare Workers.
3. **Email one-time code or magic link.** The only method with running
   costs and abuse risk. It is limited to invites with an `emails`
   allowlist, so the job server never mails arbitrary addresses and volume
   is bounded by what researchers invited. Add rate limits per address and
   per invite. Each deployment configures its own email provider (SES,
   Resend, SMTP), so costs land on the job that uses it.

**Flow.**

1. The job server verifies the identity.
2. It calls `coders/resolve` with `{ identity, inviteSecret, participantId }`.
   The db server checks the invite rules (allowlist, `maxUses`). It returns
   the existing coder for that identity in this job, or creates one.
3. The job server issues a short-lived signed session token
   `{ deployment, coderId, exp }`. Sessions are stateless; nothing is stored.

Emails go only to the db server. The job server keeps them no longer than
the request.

Until this exists, `auth: "required"` invites are refused with
`401 { code: "auth_required" }`.

## 6. Open points

- **Hash coder keys at rest.** The db server could store a hash of the coder
  key instead of the key itself. Cheap, and worth doing in a real db server.
- **Revoking a transfer.** Should "move this session" (revoke the old
  device's key) exist next to "copy"? Probably only once there is a reason;
  with a login, the identity is the thing to revoke instead.
- **Duplicate work across sessions of one participant.** Dynamic sources
  count codings per coder, so two sessions of one person can code the same
  unit. Possible later: optionally treat sessions with the same participant
  id as one person for distribution.
