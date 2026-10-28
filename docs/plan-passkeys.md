# Plan: login provider, passkeys as a second layer, and a shared login with AmCAT

Status: proposed, not built (2026-10-28). Complements `coder-identity.md`
(§7: researcher login) and `accounts.md` (§5: second factor).

## 1. Goal

- One login for the services we host (AnnoTinder, AmCAT, others): a
  self-hosted, battle-tested OpenID Connect provider in the EU.
- Two independent layers for researcher access: the provider proves who
  someone is (first factor); AnnoTinder itself checks a **passkey** (second
  factor). Someone who gets into the provider, or into a researcher's email
  or Google account, still can't touch job data.
- Coders never need a passkey.

## 2. The login provider

**Choice:** a self-hosted, widely used provider instead of our own
(Cloudflare-based) one: **Zitadel** or **Authentik**, on a small VM at an
EU host. Both do email codes or magic links, social logins (Google;
Microsoft only with verified emails), passkeys and TOTP, and can later
broker eduGAIN through an OIDC proxy (SURF Research Access Management, EGI
Check-in).

- **Zitadel**: one Go binary and Postgres; the lighter one to run.
- **Authentik**: richer flow editor; a larger Python stack with frequent
  releases. AnnoTinder's tests and docs were written against it so far.

Either way AnnoTinder doesn't change: it is an OIDC client (issuer, client
id, secret).

**Email:** Scaleway Transactional Email (EU, SMTP, about €0.25 per 1000
today), from a separate sending subdomain (e.g. `auth.<domain>`) with SPF,
DKIM and DMARC.

**Provider settings that matter for security:**

- Email addresses must be verified (`email_verified`): AnnoTinder keys
  accounts on the email address.
- Link a social login to an existing account by email only for sources that
  verify email (Google yes; multi-tenant Microsoft Entra not without
  verified-domain checks, the "nOAuth" problem; GitHub: verified primary
  email only).
- Rate-limit email codes per address and IP; a CAPTCHA on self-registration.
  These stop the login page from being used to spam people.
- Automatic security updates, backups, admin console behind its own second
  factor. Whoever controls the provider controls the first layer for every
  service.

The provider's own second factor is optional (a third layer): AnnoTinder
doesn't rely on its `amr` claim any more (§3).

## 3. Passkeys in AnnoTinder

### Who and when

- `ANNOTINDER_REQUIRE_MFA=1` comes to mean: researcher access (the
  researcher and admin APIs; `GET /me` excepted) needs a session that
  confirmed a passkey **in AnnoTinder**. Coding never does. The provider's
  `amr` claim no longer counts: it is the same party as the first layer.
- A session records when it last confirmed a passkey: `sessions.mfa_at`
  (replacing the boolean `sessions.mfa`).
- **At the start**: after login, a researcher confirms a passkey before
  anything else (a screen in the researcher UI, as the "second factor"
  notice now).
- **Step-up** (later, if wanted): sensitive actions need a passkey
  confirmed in the last 15 minutes: downloading results
  (`listAnnotations`, `listCoders`), deleting coders or jobs, changing job
  users, creating API keys, every admin action. 403 `passkey_required`, the
  client asks for the passkey and retries.

### Enrolment

The weak spot is the first passkey: someone who got into the provider
account before the real user enrolled could enrol their own.

- Enrolment is required when a user first gets researcher access (their
  first login as a researcher, or right after becoming one), before
  anything else works. A server that turns on `ANNOTINDER_REQUIRE_MFA`
  later asks existing researchers at their next login.
- A further passkey needs a confirmed existing one.
- Every passkey added or removed is listed in the account menu with its
  date and name, written to a per-user security log, and (once AnnoTinder
  sends email, §5) mailed to the user.
- Synced passkeys (iCloud Keychain, Google Password Manager, 1Password) are
  fine and make loss rare; the setup screen recommends a second one.

### Recovery

Never through email: the mailbox usually is the first layer, so email
recovery would collapse the two layers into one.

- **Recovery codes**: 10 one-time codes, shown once at enrolment (and when
  regenerated, which needs a passkey), stored hashed. Using one lets the
  user enrol a new passkey, and uses the code up.
- **Admin reset**: an admin removes a user's passkeys after checking their
  identity out of band (e.g. a video call, or their institution). Logged in
  the admin log; the user enrols again at the next login.

### API keys

They stay one factor, so: creating one needs a fresh passkey; keys get an
expiry (default 90 days, at most a year); the list shows their last use
(already there).

### Building blocks

- Library: SimpleWebAuthn (`@simplewebauthn/server`, `@simplewebauthn/browser`).
  `rpID` is the host of `ANNOTINDER_PUBLIC_URL`; `userVerification:
  "required"` (a PIN or biometric on the device, so the passkey itself is
  two factors).
- Tables: `passkeys` (user, credential id, public key, counter, transports,
  name, created, last used), `recovery_codes` (user, hash, used at),
  `security_log` (user, at, event).
- Endpoints (researcher API, under `/auth/passkey/...` and `/me/...`):
  registration options and verification, authentication options and
  verification, list and remove passkeys, regenerate recovery codes, use a
  recovery code; admin: `POST /admin/users/:id/reset-passkeys`.
- Challenges live in a short-lived signed cookie, as the login state does
  now (`researcher/login.ts`).

## 4. AmCAT and AnnoTinder on one server

The case: both in one Docker Compose, on one domain (e.g.
`research.uni.nl/amcat` and `/annotinder`), and a researcher should log in
once, and confirm a passkey once.

### Why a shared cookie secret isn't enough

AnnoTinder's sessions aren't signed cookies: the cookie holds a random key,
the database its hash (`sessions`), so sessions can be ended (logout,
blocking) at once. AmCAT accepting the same cookie would need to read
AnnoTinder's session table. And passkeys need **one** store of credentials:
if each app keeps its own, a user enrols and confirms twice; if both read
one table, two implementations (Python and TypeScript) of security-critical
code share a schema. Both get fragile.

Signed, stateless cookies with a shared secret would avoid the table, but
lose immediate revocation (a blocked user keeps access until the cookie
expires) and still leave the passkey store problem.

### Recommendation: an auth sidecar, extracted from AnnoTinder, when it's needed

One small Node service owns **identity**: the OIDC login, sessions,
passkeys and recovery codes. The apps keep **authorization**: roles, job
roles, limits.

```
 browser ── reverse proxy ──┬── /auth/*        → auth sidecar (login, sessions, passkeys)
                            ├── /annotinder/*  → AnnoTinder ─┐
                            └── /amcat/*       → AmCAT ──────┤ GET http://auth/session
                                                             │ (cookie forwarded)
                                                 auth sidecar ┘ → { userId, email, mfaAt } | 401
```

- The sidecar sets the one session cookie (path `/`, httpOnly, the CSRF
  header rule as now).
- The apps ask it who a request is from: an internal `GET /session` with
  the cookie, answered with `{ email, mfaAt }`, cached for a few seconds.
  Revocation stays immediate (up to the cache), and no secret is shared:
  the sidecar is the only one that can read sessions.
- One domain, one `rpID`: one passkey works for both apps, confirmed once
  per session. Step-up (§3) is the apps asking "is `mfaAt` recent enough?"
  and sending the user to the sidecar's passkey screen if not.
- Each app maps the email to its own users and roles. Blocking a user is
  per app; the sidecar can also block a login everywhere.

**Standalone AnnoTinder** (the public server) keeps the same code built in:
the auth module (`researcher/login.ts`, `shared/sessions.ts`, the passkey
code) is written behind this boundary from the start (`/auth/*` routes, a
`currentUser(request)` function the rest of the server calls), so the
sidecar is that module run on its own, not a rewrite. AmCAT then only needs
the client side: call `GET /session`.

**How hard:** the boundary costs little now (the code is already mostly
separate). The sidecar itself is a packaging step plus the introspection
endpoint; AmCAT's part is a middleware that calls it. Most of the work is
in the passkey code (§3), which is needed anyway.

### Alternatives considered

- **Passkeys in each app, shared cookie secret:** two enrolments, or one
  credential table shared across two codebases (above). No.
- **SSO through the provider only, each app its own session:** works today
  without any change (the provider's own session makes the second login a
  redirect), but passkeys would be confirmed per app.
- **The provider does the passkey:** one layer again (§1).

## 5. Open points

- AnnoTinder sending email (security notices, researcher requests,
  deletion requests): through Scaleway's API, from the same sending domain.
- Whether AmCAT adopts the same rules (enrolment, recovery codes, step-up
  window); the sidecar makes that automatic for a shared deployment.
- Step-up: which actions, and whether 15 minutes is right.
