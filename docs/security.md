# Security

What AnnoTinder does to protect researchers' data and coders, and the
settings that go with it. Hosting: `hosting.md`. Accounts and roles:
`accounts.md`. Coders' sessions: `coder-identity.md`.

## 1. Login, second factor and step-up

AnnoTinder follows the Societal Analytics Lab's Authentication standard
(the lab-infra repository, `docs/auth.md`), shared with AmCAT.

**The login provider.** Researchers log in with an OpenID Connect provider
(`OIDC_HOST`): ideally the institution's, managed by a security team with a
helpdesk for account recovery (the lab's own Keycloak works too:
`hosting.md`). AnnoTinder runs the login on the server
(authorization code flow with PKCE) and keeps its own session: a signed,
http-only cookie on its own origin. The provider must, and AnnoTinder checks
each of these itself, because providers don't always do what was asked:

| Requirement | What the provider does |
| --- | --- |
| **Verified email** | `"email_verified": true` in the ID token. Without it the login is refused (unless `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION`, below). |
| **A second factor, signalled** | 2FA, and a claim saying it was used: `OIDC_MFA_CLAIM`, `amr:mfa` (default) or `acr:<value>` (e.g. SURFconext's `acr:http://test.surfconext.nl/assurance/loa2`). Can be turned off (`AUTH_INSECURE_DISABLE_2FA`, below). |
| **Step-up** | Honours `max_age`, and returns `auth_time` in the ID token. Can't be turned off. |

**Who needs the second factor** (unless `AUTH_INSECURE_DISABLE_2FA`, below):

- **Researchers** work without one. The client shows an orange shield by
  the account menu, with what 2FA is needed for and a link to the
  provider's account page (`OIDC_ACCOUNT_URL`) to set it up. Users set it
  up themselves: with 2FA required, `OIDC_ACCOUNT_URL` is required too (the
  server refuses to start without it), because a server where an
  administrator must set up 2FA for everyone can't be maintained. OpenID
  Connect discovery has no standard field for an account page.
- **Sensitive actions** (below) need a recent login with one (step-up), as
  the lab standard asks.
- **Server admins**: the admin role only applies to a login with one.
  Without it they work as a researcher (`GET /me`: `twoFactor.adminOff`),
  and admin endpoints answer 403 `mfa_required`. Stricter than the lab
  standard.

Coding never needs a second factor, nor a login. Account recovery (a lost phone) is the
provider's: AnnoTinder has no second factor of its own.

**Step-up for sensitive actions.** These need a web session whose login
(with the second factor) is at most `AUTH_STEP_UP_MAX_AGE` seconds old
(default 600):

- creating or revoking API keys;
- resetting answers (`POST /study/:id/annotations/reset`), deleting coders'
  data (`POST /study/:id/coders/delete`), deleting a study;
- giving or taking the admin role: a study's ADMINs (`PUT /study/:id/users`
  when its ADMINs change) and the server admin role (`/admin/users`).

Otherwise the server answers 403 `step_up_required`, and the client sends
the researcher to log in again with `?stepUp=1`: the server asks the
provider for `max_age`, then checks the new ID token's 2FA claim and
`auth_time` itself (`loginError=step_up_failed` if they don't hold). With
`AUTH_INSECURE_DISABLE_2FA` only `auth_time` is checked.

**Weaker security: teaching and low-sensitivity servers.** Two requirements
can be turned off in `.env`, each named `INSECURE` because it makes the
server less secure. Never on a server with sensitive research data. Both
are logged at every start and shown as hardening warnings; turning one off
again restores the requirement.

- `AUTH_INSECURE_DISABLE_2FA=true`: no second factor, for admin access
  or for sensitive actions, which still need a recent login (step-up with
  `auth_time`); `OIDC_ACCOUNT_URL` is optional then. Whether a login used 2FA is still recorded (`has_mfa`, the
  *no 2FA* mark). For providers without a usable 2FA signal, such as a free
  Auth0 tenant. The risk: whoever has a user's password, or their mailbox
  (to reset it), can do that user's sensitive actions.
- `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION=true`: users log in when the
  provider doesn't confirm their address (`email_verified` false or
  missing; recorded on the user). They can still claim roles given to that
  address (invitations), and code as that address in a study with email
  coders, so on a provider where people choose their own
  address someone could claim another's roles. Roles by email domain, and
  roles for everyone with a verified address, still need
  `email_verified: true`. Only for a provider that does verify addresses
  but doesn't send the claim.

**API keys** are for other clients (R, Python): made and revoked only in the
web client with a fresh second factor, and they never do the sensitive
actions above (403 `not_with_api_key`). A key counts as having the second
factor for everything else. The server's operator can make one on the
command line (`pnpm keys create`).

**Development mode** (`AUTH_DEV_MODE=1`): development headers
(`x-dev-role`, `x-dev-email`) instead of a login. The server refuses to
start in development mode unless it listens on localhost only (`HOST`).
Never for a server other people use.

**Hardening warnings** (*Server admin*, top of the page; `GET /admin/warnings`):

| Warning | Meaning |
| --- | --- |
| 2FA not required | `AUTH_INSECURE_DISABLE_2FA` is set: not for sensitive data. |
| Email verification not required | `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` is set: not for sensitive data. |
| Roles for unverified email addresses | Users with roles whose provider didn't confirm their address (marked "email not verified" in *Users*): check that they are the right people. |
| No 2FA signal | Server admins logged in recently without the 2FA claim, so their admin access is off: if they did use a second factor, check the provider's 2FA and `OIDC_MFA_CLAIM`. Not shown with `AUTH_INSECURE_DISABLE_2FA`. |
| Migration not finished | `OIDC_PREVIOUS_*` is set: until `OIDC_PREVIOUS_UNTIL`, how many users haven't linked their login at the new provider (marked "not linked" in *Users*); after it, remove those settings. |

**Who someone is**: their login at the provider (`iss` + `sub`), not their
email address; roles go to users, or to users with a verified email at a
domain (the latter only with a verified address). Safeguards keep a later owner of an email address from getting
someone's roles (dormant users, invitations expire after 3 months):
`accounts.md` §1–2.

Logins (with their provider and whether they used a second factor) and
linked logins (`identity_linked`) are written to `security_log`.

## 2. Headers

Every response (`shared/securityHeaders.ts`):

| Header | Value | Why |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Browsers don't guess a file's type (an upload served as HTML) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Coder links carry their secret in the URL: other sites (a panel's return link, an image in a unit) only see the origin |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB off | Nothing in AnnoTinder uses them |
| `Cross-Origin-Opener-Policy` | `same-origin` | Pages opened from AnnoTinder can't reach back into it |
| `Strict-Transport-Security` | `max-age=31536000` | With an `https` `ANNOTINDER_PUBLIC_URL`: browsers keep using HTTPS for a year |

Pages (HTML) also get a **Content Security Policy**: everything from
AnnoTinder's own origin, and:

- `script-src 'self' 'wasm-unsafe-eval'`: conditions run in QuickJS
  (WebAssembly); no inline or foreign scripts. Plus one hash: the `::html`
  frame's height script (an iframe's `srcdoc` falls under the page's
  policy). The `::html` frame has its own, stricter policy on top: no
  scripts but that one, no requests.
- `style-src 'self' 'unsafe-inline'`: React, the code editor and layouts'
  style blocks set styles inline. Styles can't run code.
- `img-src` and `media-src` also `https:`, `data:` and `blob:`: units may
  show images and media from the web.
- `worker-src 'self' blob:` (the code editor), `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`.
- `frame-ancestors 'self'`: other sites can't show AnnoTinder in a frame
  (clickjacking), except origins in `ANNOTINDER_FRAME_ANCESTORS` (e.g.
  AmCAT). Without those, also `X-Frame-Options: SAMEORIGIN` for older
  browsers.

The end-to-end tests fail on any policy violation (`packages/e2e/tests/
fixtures.ts`), so a change that needs more is noticed.

## 3. Rate limits

Generous ceilings against floods and guessing, not fraud detection (answer
timings are for that, `coder-identity.md` §10). Per minute
(`shared/rateLimit.ts`):

| Kind | Per | Default |
| --- | --- | --- |
| Coder requests from a browser without a session (new sessions, guessed links) | address | 300 |
| Redeeming "continue on another device" tokens | address | 30 |
| Logging in | address | 60 |
| The researcher API | account (API key or login), else address | 1200 |
| All coder requests (in memory, per process) | address | 10,000 |

A class or lab behind one address (hundreds of coders at once) stays well
below them. Over a limit: 429 `rate_limited` with `Retry-After: 60`; the
coding client waits and tries again.

Counts are kept in Postgres, in an `UNLOGGED` table (no write-ahead log:
cheap to write, and losing counts in a crash is harmless), so several server
processes share them; minutes older than 10 are deleted as the server goes.
Behind a proxy, set `ANNOTINDER_TRUST_PROXY=1` so the client's address comes
from `X-Forwarded-For` (the compose file does, as the app is only reachable
through it). `ANNOTINDER_RATE_LIMITS=off` turns them off (e.g. a load test
from one machine).

## 4. Exported data

Coders' text goes into the CSV files of the download as written. Spreadsheet
programs (Excel, Google Sheets, Numbers) run a cell that starts with `=`,
`+`, `-` or `@` as a formula, which a coder could abuse (e.g. a link that
sends data elsewhere). By default the download puts a `'` before such text
(not before numbers like `-3`): spreadsheets then show it as text. R and
Python read the `'` as part of the text; `README.txt` in the download says
how to remove it, and the option can be turned off at download. This is the
usual protection (OWASP "CSV injection"); the CSV standard itself has no
answer to it.

## 5. Coders

- **Sessions** are a device cookie (`coder-identity.md` §4): httpOnly, and
  only a hash is stored. A coder id is a label, never a key: a link
  with a known coder id on a new device doesn't continue that session.
  The coder is asked to continue on their first device, and can only start
  again after confirming they can't get back to it.
- **Logging in** on a link that allows it links the login's email to the
  coder's session (stored as the session's email). That is allowed for
  anyone who has the session on their device: it says who the coder is.
- **`::html`** unit content runs in a sandboxed frame with an opaque origin
  and its own policy: it can't reach the app, cookies or the network.
- **CSRF**: every API request needs the `x-annotinder: 1` header, which
  other sites can't send; cookies are `SameSite=Lax`.

## 6. Settings

| Variable | |
| --- | --- |
| `OIDC_HOST`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | The login provider (§1) |
| `OIDC_MFA_CLAIM` | Which claim counts as a second factor: `amr:mfa` (default) or `acr:<value>` (§1) |
| `OIDC_ACCOUNT_URL` | The provider's account page, where users set up a second factor; required unless `AUTH_INSECURE_DISABLE_2FA` (§1) |
| `OIDC_PREVIOUS_*`, `OIDC_PREVIOUS_UNTIL` | The previous login provider while moving to another (`accounts.md` "Changing providers") |
| `AUTH_STEP_UP_MAX_AGE` | Seconds a login stays fresh for sensitive actions (default 600, §1) |
| `AUTH_INSECURE_DISABLE_2FA` | `true`: no second factor required (weaker security, §1) |
| `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` | `true`: unverified email addresses can log in (weaker security, §1) |
| `AUTH_DEV_MODE` | `1`: development headers, localhost only (§1) |
| `ANNOTINDER_PUBLIC_URL` | Where browsers reach the server (the login callback); an `https` address turns on HSTS |
| `ANNOTINDER_FRAME_ANCESTORS` | Origins that may frame AnnoTinder (§2) |
| `ANNOTINDER_TRUST_PROXY` | `1` behind a proxy that sets `X-Forwarded-For` (§3) |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (§3) |
| `ANNOTINDER_SECRET` | Signs login state and preview links |
