# Security

How AnnoTinder protects researchers' data and coders, and the settings that
go with it. Hosting: `hosting.md`. Accounts and roles: `accounts.md`. Coder
sessions: `coder-identity.md`.

## 1. Login, second factor and step-up

AnnoTinder follows the Societal Analytics Lab's Authentication standard
(lab-infra `docs/auth.md`), shared with AmCAT.

**The login provider.** Researchers log in with an OpenID Connect provider
(`OIDC_HOST`), ideally the institution's (with a helpdesk for account
recovery); the lab's Keycloak works too (`hosting.md`). The server runs the
login itself (authorization code flow with PKCE) and keeps its own session in
an httpOnly cookie. It checks each requirement itself:

| Requirement | What the provider does |
| --- | --- |
| **Verified email** | `"email_verified": true` in the ID token, else the login is refused (unless `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION`) |
| **A signalled second factor** | a claim saying 2FA was used: `OIDC_MFA_CLAIM`, `amr:mfa` (default) or `acr:<value>` (e.g. SURFconext's `acr:http://test.surfconext.nl/assurance/loa2`). Can be turned off (`AUTH_INSECURE_DISABLE_2FA`) |
| **Step-up** | honours `max_age` and returns `auth_time`. Can't be turned off |

**Who needs the second factor:**

- **Researchers** work without one. An orange shield by the account menu
  says what it is needed for and links to the provider's account page
  (`OIDC_ACCOUNT_URL`), where users set it up themselves. With 2FA required,
  `OIDC_ACCOUNT_URL` is required too (the server won't start without it).
- **Sensitive actions** need a recent login with one (step-up, below).
- **Server admins**: the admin role applies only to a login with one;
  otherwise they work as a researcher (`GET /me`: `twoFactor.adminOff`) and
  admin endpoints answer 403 `mfa_required`. Stricter than the lab standard.

Coding never needs a second factor or a login. Account recovery is the
provider's job.

**Step-up for sensitive actions.** These need a web session whose login (with
the second factor) is at most `AUTH_STEP_UP_MAX_AGE` seconds old (default
600):

- creating or revoking API keys;
- resetting answers, deleting coders' data, deleting or exporting a study;
- changing a study's ADMINs (`PUT /study/:id/users`) or the server admin role.

Otherwise: 403 `step_up_required`, and the client sends the researcher to log
in again with `?stepUp=1`. The server asks the provider for `max_age` and
checks the new token's 2FA claim and `auth_time` (`loginError=step_up_failed`
if they don't hold). With `AUTH_INSECURE_DISABLE_2FA` only `auth_time` is
checked.

**Weaker security** (teaching, low-sensitivity servers). Two requirements can
be turned off; never on a server with sensitive research data. Both are
logged at start and shown as hardening warnings.

- `AUTH_INSECURE_DISABLE_2FA=true`: no second factor for admin access or
  sensitive actions (they still need a recent login); `OIDC_ACCOUNT_URL`
  becomes optional. For providers without a usable 2FA signal (e.g. a free
  Auth0 tenant). Risk: whoever has a user's password or mailbox can do their
  sensitive actions.
- `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION=true`: users log in although the
  provider doesn't confirm their address. They can still claim invitations to
  that address and code as it in a study with email coders, so with a provider
  where people choose their own address, someone could take another's roles.
  Domain roles and roles for everyone still need a verified address. Only for
  a provider that verifies but doesn't send the claim.

**API keys** are for other clients (R, Python): made and revoked only in the
web client with a fresh second factor; they count as having the second factor
but never do sensitive actions (403 `not_with_api_key`). The operator can make
one on the command line (`packages/server/README.md`, "API keys").

**Development mode** (`AUTH_DEV_MODE=1`): `x-dev-role` / `x-dev-email`
headers instead of a login. The server refuses to start in this mode unless
it listens on localhost only. Never on a server others use.

**Hardening warnings** (top of *Server admin*; `GET /admin/warnings`):

| Warning | Meaning |
| --- | --- |
| 2FA not required | `AUTH_INSECURE_DISABLE_2FA` is set |
| Email verification not required | `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` is set |
| Roles for unverified email addresses | users with roles whose address wasn't confirmed (marked in *Users*): check they are the right people |
| No 2FA signal | admins logged in recently without the 2FA claim: if they did use one, check the provider and `OIDC_MFA_CLAIM` |
| Migration not finished | `OIDC_PREVIOUS_*` is set: how many users haven't linked their new login; remove the settings after `OIDC_PREVIOUS_UNTIL` |

**Who someone is**: their login at the provider (`iss` + `sub`), not their
address. Safeguards keep a later owner of an address from getting someone's
roles (`accounts.md` §2, "Safeguards"). **Changing providers**: `accounts.md`,
"Changing providers". Logins (provider, whether 2FA was used) and linked
logins are written to `security_log`.

## 2. Headers

Every response (`shared/securityHeaders.ts`):

| Header | Value | Why |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | no guessing file types |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | coder links carry their secret: other sites see only the origin |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB off | unused |
| `Cross-Origin-Opener-Policy` | `same-origin` | opened pages can't reach back |
| `Strict-Transport-Security` | `max-age=31536000` | with an `https` `ANNOTINDER_PUBLIC_URL` |

Pages also get a **Content Security Policy**: everything from the own origin,
plus:

- `script-src 'self' 'wasm-unsafe-eval'` (QuickJS is WebAssembly) and one
  hash: the `::html` frame's height script. The frame has its own stricter
  policy: no other scripts, no requests.
- `style-src 'self' 'unsafe-inline'` (React, the code editor, style blocks).
- `img-src` and `media-src` also `https:`, `data:`, `blob:` (units show web
  images and media).
- `worker-src 'self' blob:`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`.
- `frame-ancestors 'self'` plus `ANNOTINDER_FRAME_ANCESTORS` (e.g. AmCAT);
  without those also `X-Frame-Options: SAMEORIGIN`.

The end-to-end tests fail on any policy violation
(`packages/e2e/tests/fixtures.ts`).

## 3. Rate limits

Generous ceilings against floods and guessing, not fraud detection (that is
what answer timings are for, `coder-identity.md` §10). Per minute
(`shared/rateLimit.ts`):

| Kind | Per | Default |
| --- | --- | --- |
| Coder requests without a session (new sessions, guessed links) | address | 300 |
| Redeeming transfer tokens | address | 30 |
| Logging in | address | 60 |
| Researcher API | account, else address | 1200 |
| All coder requests (in memory, per process) | address | 10,000 |

A class behind one address stays well below them. Over a limit: 429
`rate_limited` with `Retry-After: 60`; the coding client waits and retries.
Counts live in an `UNLOGGED` Postgres table shared by all processes. Behind a
proxy set `ANNOTINDER_TRUST_PROXY=1` (compose does): the address is then the
last entry of `X-Forwarded-For`. With a second proxy in front (Cloudflare)
that entry is the proxy, unless the first one is set up as in `hosting.md`,
"The visitor's real address". `ANNOTINDER_RATE_LIMITS=off`
turns them off (e.g. a load test).

## 4. Exported data

Coders' text goes into the downloaded CSV files as written. Spreadsheets run
a cell starting with `=`, `+`, `-` or `@` as a formula ("CSV injection"), so
by default the download puts a `'` before such text (not before numbers like
`-3`). `README.txt` in the download says how to strip it in R or Python; the
option can be turned off at download.

## 5. Coders

- **Sessions** are a device cookie (`coder-identity.md` §4): httpOnly, only a
  hash stored. A coder id is a label: a link with a known coder id on a new
  device doesn't continue that session.
- **Logging in** on a link links the login's email to the session.
- **`::html`** content runs in a sandboxed frame with an opaque origin: no
  access to the app, cookies or network.
- **CSRF**: every API request needs `x-annotinder: 1`; cookies are
  `SameSite=Lax`.

## 6. Settings

| Variable | |
| --- | --- |
| `OIDC_HOST`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | the login provider (§1) |
| `OIDC_MFA_CLAIM` | the second-factor claim: `amr:mfa` (default) or `acr:<value>` (§1) |
| `OIDC_ACCOUNT_URL` | where users set up a second factor; required unless `AUTH_INSECURE_DISABLE_2FA` (§1) |
| `OIDC_PREVIOUS_*`, `OIDC_PREVIOUS_UNTIL` | the previous provider while changing (`accounts.md`) |
| `AUTH_STEP_UP_MAX_AGE` | seconds a login stays fresh for sensitive actions (default 600) |
| `AUTH_INSECURE_DISABLE_2FA` | `true`: no second factor required (§1) |
| `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` | `true`: unverified addresses can log in (§1) |
| `AUTH_DEV_MODE` | `1`: development headers, localhost only |
| `ANNOTINDER_PUBLIC_URL` | the public address; `https` turns on HSTS |
| `ANNOTINDER_FRAME_ANCESTORS` | origins that may frame AnnoTinder (§2) |
| `ANNOTINDER_TRUST_PROXY` | `1` behind a proxy that sets `X-Forwarded-For` (§3) |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (§3) |
| `ANNOTINDER_SECRET` | signs login state and preview links |
