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
- resetting answers, deleting coders' data, exporting a study;
- deleting a study, and deleting an account (one's own, or an admin deleting
  a registered user's). These also ask to type what goes: the study's name,
  the account's email address (`accounts.md` §5);
- changing who is a study's ADMIN (`PUT /study/:id/users`);
- every change of who is a server admin: giving or taking the admin role
  (also inviting someone as admin), and blocking, unblocking, restoring the
  roles of, or withdrawing the invitation of someone who holds it;
- linking a new login to an account while changing providers (below).

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
web client with a fresh second factor. A key has no second factor and no
expiry, so it can do less than its user:

- it never does sensitive actions (403 `not_with_api_key`);
- it is **never an admin**: an admin's key works as a researcher's, and the
  admin API answers it 403 `admin_required`. Server admin work needs a web
  session.

The operator can make a key on the command line
(`packages/server/README.md`, "API keys"); the same holds for it.

**No role, no study.** A study the user has no role in answers 404, the same
as a study that doesn't exist, so ids don't tell which studies a server has.
403 is for a role that is too low.

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
"Changing providers".

**Linking a login** (`/auth/login?link=1`) decides who can log in as a user
from then on, so the server allows it only:

- while the server moves providers (`OIDC_PREVIOUS_*` set, before
  `OIDC_PREVIOUS_UNTIL`);
- from a session that logged in with the previous provider;
- for a user who has no login at the current provider yet (one per provider);
- with a recent login: if the session's isn't recent, the server first asks
  for a step-up login at the previous provider, then goes on;
- with a login the current provider asks for then and there (`prompt=login`),
  whatever session the browser has there;
- with a login that isn't another account's already.

Anything else comes back with `loginError=link_failed`.

**The session.** A random key in an httpOnly, `SameSite=Lax` cookie
(`Secure` over HTTPS); the database has only its hash. It lasts 14 days from
its last use: the server extends it at most once an hour, and sends the
cookie again when it does. A new login ends the session it replaces (the
one of the cookie the browser had); every login, and the server every
hour, removes the sessions that have expired (`coder-identity.md` §7).

**The security log** (`security_log`, per user) records:

| Event | When | Details |
| --- | --- | --- |
| `login` | every login | the provider, whether a second factor was used, whether it was a step-up login, an unconfirmed address |
| `identity_linked` | a login was linked to the account | the provider |
| `api_key_created`, `api_key_revoked` | | the key's id and label |
| `study_exported` | a study export was downloaded | the study |
| `answers_reset` | answers were reset (`POST /study/:studyId/annotations/reset`) | the study, and how many answers were retired |
| `study_deleted` | | the study's id and name |
| `study_users_changed` | a study's users were changed | who went from which role to which, roles restored |

A user's log is deleted with their account. What admins do (also deleting a
user) is in `admin_log`, with the admin's address.

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
what answer timings are for, `coder-identity.md` §10). Each kind of request is
counted per address or per user, in windows of a fixed length
(`shared/rateLimit.ts`):

| Kind | Per | Window | Default |
| --- | --- | --- | --- |
| New coder sessions: a device without a session in a study asking for one (also guessed links) | address | 10 minutes | 500 (`ANNOTINDER_NEW_SESSIONS_PER_ADDRESS`: a number, or `off`) |
| Redeeming transfer tokens | address | 1 minute | 30 |
| Logging in: starting a login and coming back from the provider | address | 1 minute | 60 |
| Researcher API (`/study`, `/me`, `/admin`), before the request is authenticated | address | 1 minute | 6000 |
| Researcher API, once authenticated | user | 1 minute | 1200 |
| All coder requests (`/d`, `/coder`; in memory, per process) | address | 1 minute | 10,000 |

- **Per researcher user**: one user's requests are one count, whatever
  address they come from and whether by session or by any of their API keys.
  The limit per address comes first and is higher, so a department behind one
  address fits, and requests with made-up credentials are still counted.
- **New sessions** are only a brake: a class or a university network shares
  one address, so the default is high. Lower it only if you know who codes.
  Counted in `runtime/requestCoder.ts` (`countNewSession`), in two places:
  - a request of a device that has no session in the study, before the
    session is looked for or started (`beforeNewSession`). Whether a device
    has a session is what the database says, not whether the request has a
    device cookie: a made-up cookie counts like none. So does a request that
    asks for a new session (`x-new-session`). Other requests of a device
    that has a session never count;
  - a request the server refuses before it loads the study, with 404
    `link_not_found` or a preview's 401 (`loadRuntime`): a guessed link
    secret, study id or preview token.
- **Sessions per coder id.** A coder id has at most 5 sessions in a study
  (`MAX_SESSIONS_PER_CODER`; 403 `coder_session_limit`,
  `coder-identity.md` §4). Not a rate limit and not a setting: a new session
  of a known coder id doesn't use up the link's `maxCoders`, so without it
  one participant could fill a study with sessions.
- Over a limit: 429 `rate_limited` with `Retry-After` (the seconds until the
  window ends); the coding client waits and retries.
- Counts live in an `UNLOGGED` Postgres table shared by all processes, except
  the last row.
- `ANNOTINDER_RATE_LIMITS=off` turns them all off (e.g. a load test from one
  machine).

**Whose address.** Anyone can send a header that names an address, so the
server believes one only from what the operator says is in front of it,
`ANNOTINDER_TRUST_PROXY` (`shared/clientAddress.ts`):

| Value | In front of the server | The address is |
| --- | --- | --- |
| `none` (default) | nothing: browsers connect to it | the connection's |
| `proxy` (`compose.yml` sets it) | one reverse proxy (Caddy, nginx), the only way in | the last entry of `X-Forwarded-For`, which that proxy wrote |
| `cloudflare` | Cloudflare in front of that proxy | `CF-Connecting-IP`, for requests the proxy got from one of Cloudflare's addresses; for others as `proxy` |

Any other value (also the earlier `1`) and the server doesn't start. It says
at start-up where it takes addresses from. With `proxy` behind Cloudflare,
all visitors behind one Cloudflare address share a count: `hosting.md`, "The
visitor's real address".

## 4. Exported data

Coders' text goes into the downloaded CSV files as written: nothing is added
or escaped, so R and Python read what the coder typed. Spreadsheets run a
cell starting with `=`, `+`, `-` or `@` as a formula ("CSV injection"), so
the CSV files are not for a spreadsheet program: the Download page says so
next to the CSV choice, and `README.txt` in the download repeats it. For
looking at the data in a spreadsheet the download offers Excel (.xlsx),
whose text cells are plain text and never run as formulas
(`client/src/lib/admin/xlsx.ts`).

The stored results download (the raw export) and the study export hold
coders' answers; who can get them, and when they are removed:
`api/researcher.md` (`exportResults`, `exportStudy`).

## 5. Coders

- **Sessions** are a device cookie (`coder-identity.md` §4): httpOnly, only a
  hash stored. A coder id is a label: a link with a known coder id on a new
  device doesn't continue that session.
- **Logging in** on a link links the login's email to the session, but
  only where the study requires sign-in or the coder chose it
  (`x-use-login`, `coder-identity.md` §5): a login that is just there in the
  browser never ends up on a session.
- **Requests that show nothing of a study** (no link, device, transfer token
  or login of it) get one 404, the same whether the study exists, is
  deployed or is suspended, and the study isn't loaded for them
  (`api/coder.md`). A server process keeps at most 200 studies and
  previews loaded (`architecture.md` §3).
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
| `ANNOTINDER_TRUST_PROXY` | `none` (default), `proxy` or `cloudflare`: what is in front of the server (§3) |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (§3) |
| `ANNOTINDER_NEW_SESSIONS_PER_ADDRESS` | new coder sessions per address per 10 minutes (default 500), or `off` (§3) |
| `ANNOTINDER_SECRET` | signs login state, preview links and download links; at least 32 characters, required with `DATABASE_URL` |
| `ANNOTINDER_ADMINS` | addresses that get the admin role at login, if the provider confirmed the address |
