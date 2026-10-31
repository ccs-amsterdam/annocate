# Security

What AnnoTinder does to protect researchers' data and coders, and the
settings that go with it. Hosting: `hosting.md`. Accounts and roles:
`accounts.md`. Coders' sessions: `coder-identity.md`.

## 1. Second factor for researchers

Researchers log in with a login provider (OpenID Connect, e.g. Zitadel,
Authentik or a university's). That is the first factor. `ANNOTINDER_2FA`
decides who checks the second one:

| `ANNOTINDER_2FA` | Second factor |
| --- | --- |
| `none` (default) | None required |
| `annotinder` (recommended) | A **passkey**, checked by AnnoTinder itself |
| `oidc` | The login provider's own second factor, as it reports it (the ID token's `amr` claim) |

Coding never needs one. A login without the required second factor only
gets `GET /me`, the passkey routes and logging out (403 `mfa_required`
otherwise). API keys count as having one: creating a key needs it.

**Why `annotinder`.** With `oidc`, both factors are the provider's: someone
who gets into a researcher's provider account (or the email it sends codes
to) has both. A passkey checked by AnnoTinder is an independent second
lock. A passkey is a key pair kept on the researcher's device (or synced by
their password manager) and unlocked with a fingerprint, face or PIN, so it
is two factors in itself, and it can't be phished: it only works on
AnnoTinder's own address.

**How it works** (`researcher/passkeys.ts`, with SimpleWebAuthn):

- **First login**: before anything else, the researcher adds a passkey. It
  comes with 10 **recovery codes**, shown once.
- **Every login** is confirmed with a passkey (or a recovery code). The
  confirmation is stored on the login session (`sessions.mfa`).
- **More passkeys** (account menu, *Passkeys*): only from a confirmed
  session, so someone who got into the provider account can't add their
  own. The last passkey can't be removed.
- **A lost passkey**: a recovery code (each works once), then add a new
  passkey. No codes left: a server admin resets the user's passkeys
  (*Server admin*, *Users*, *Reset passkeys*) after checking who they are
  in another way than email (e.g. a video call). The reset ends their
  sessions; they add a new passkey at the next login. **Never by email**:
  the mailbox is usually the first factor.
- Passkeys need `ANNOTINDER_PUBLIC_URL` (the passkey is bound to its
  host name) and a login provider.
- Every passkey added or removed, recovery code made, used or refused, and
  reset is written to `security_log`.

Not built yet (`plans/passkeys.md`): step-up (a fresh passkey for
sensitive actions), expiring API keys, emailing users about security
events, and a login shared with AmCAT.

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
| Logging in, confirming with a passkey or a recovery code | address | 60 |
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
  only a hash is stored. A participant id is a label, never a key: a link
  with a known participant id on a new device doesn't continue that session.
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
| `ANNOTINDER_2FA` | `none`, `annotinder` (passkeys; recommended) or `oidc` (§1) |
| `ANNOTINDER_PUBLIC_URL` | Needed for passkeys; an `https` address turns on HSTS |
| `ANNOTINDER_FRAME_ANCESTORS` | Origins that may frame AnnoTinder (§2) |
| `ANNOTINDER_TRUST_PROXY` | `1` behind a proxy that sets `X-Forwarded-For` (§3) |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (§3) |
| `ANNOTINDER_SECRET` | Signs login state, passkey challenges and preview links |
