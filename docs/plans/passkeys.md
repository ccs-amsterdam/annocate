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

The case: both in one Docker Compose, on one origin (e.g.
`research.uni.nl/amcat` and `/annotinder`), and a researcher logs in, and
confirms a passkey, once.

### AmCAT is the login; AnnoTinder reads its cookie

AmCAT already does the OIDC login and keeps the result in an encrypted,
httpOnly cookie that says who the user is (their email). On one origin
AnnoTinder receives that cookie too. With the same key, it can decrypt it
and trust it. AmCAT is then the "sidecar": AnnoTinder needs no login, no
OIDC client and no passkeys of its own in that deployment.

- **What the cookie must hold:** the verified email, when it expires, and
  (for the second layer, §3) when a passkey was last confirmed (`mfaAt`).
  If AmCAT does the passkey, AnnoTinder only reads `mfaAt`; the passkeys
  live in AmCAT.
- **A shared, neutral format:** the two codebases (Python and TypeScript)
  must read the same cookie, so pin it down: e.g. a JWE with `dir` +
  `A256GCM` (libraries on both sides), or Fernet (a small, fixed spec). The
  key comes from the environment of both containers, with room for a
  second (old) key during rotation.
- **Logging in and out:** AnnoTinder's login button and logout go to
  AmCAT's endpoints.
- **CSRF:** unchanged: the cookie is `SameSite=Lax`, and AnnoTinder's API
  still requires the `x-annotinder: 1` header.

What a stateless cookie gives up, and why that is acceptable here: a
logout or a stolen cookie can't be undone before the cookie expires. But
AnnoTinder looks up the user's row on every researcher request anyway (for
account and job roles), so **blocking** stays immediate: a blocked user's
valid cookie gets them nothing. Keep the cookie's lifetime modest (days,
renewed while in use), as AmCAT presumably does.

### Standalone AnnoTinder

The public server has no AmCAT, so AnnoTinder keeps its own login. To have
one code path, AnnoTinder can issue the **same cookie format** itself (its
own key) instead of its current database sessions: the rest of the server
then only ever asks "is there a valid identity cookie, and what does it
say?", whoever issued it. Configuration decides who issues it: AnnoTinder
(standalone) or AmCAT (together, with the shared key; AnnoTinder's login
routes are off).

Passkeys in standalone AnnoTinder follow §3 and set `mfaAt` in the cookie
the same way AmCAT does.

### Per-request cost

- Researcher requests: decrypting the cookie (no database), plus the user
  and job-role lookups they need anyway.
- Coders who didn't log in: their session (`coders.coder_key`) is held in
  the runtime's memory after the first request: no database per answer.
- Coders who logged in: today the login is looked up once a minute per
  session at most (`cachedUserForSession`); with the cookie it is just
  decrypted.

### Not chosen

- **A separate auth service** that owns sessions and passkeys for both
  apps. Possible, but with AmCAT already doing the login, it adds a third
  service for little gain.
- **Passkeys in each app** with their own credentials: users would enrol
  and confirm twice.

## 5. Open points

- AnnoTinder sending email (security notices, researcher requests,
  deletion requests): through Scaleway's API, from the same sending domain.
- AmCAT's exact cookie format (library, key derivation, claims), so
  AnnoTinder can read it; whether AmCAT adds `mfaAt`.
- Whether AmCAT adopts the same passkey rules (enrolment, recovery codes,
  step-up window).
- Step-up: which actions, and whether 15 minutes is right.
