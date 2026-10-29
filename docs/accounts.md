# Accounts, registration and limits

Status: implemented (2026-10-28). Complements `coder-identity.md` (how
people log in) and `api/admin.md` (the endpoints).

AnnoTinder is meant to be hosted for many researchers: a public server,
and servers for groups that need stability or stricter data protection. A
server decides who may create jobs, how much they may store, and who
manages that.

## 1. Two kinds of roles

- **Job roles** (`job_users`: `READ`, `WRITE`, `ADMIN`): what someone may
  do in one job. Unchanged.
- **Account roles** (`users.role`): what someone may do on the server.
  - `user`: anyone who logged in. Codes, and works on jobs they were given
    a job role in (a student assistant editing a codebook is a user with
    `WRITE` on that job).
  - `researcher`: also creates jobs, and owns them (their limits apply).
  - `admin`: also manages accounts, limits and registration (`api/admin.md`).

So "can edit jobs" is a job role, and "can create jobs" an account role.
Coders need no account at all, unless an invitation asks them to log in
(`coder-identity.md` §5).

## 2. Who becomes a researcher

On every login (`applyRegistration`, `shared/accounts.ts`):

- emails in `ANNOTINDER_ADMINS` become admins (the first admins;
  admins can make more);
- a `user` becomes a `researcher` if registration is open, or their email
  is at a domain rule with `researcher` (`domain_rules`).

Roles are only ever raised by a login: an admin's choice to lower one stays
until the rules say otherwise. Besides these rules: researcher invite links
(`researcher_invites`: one use, an expiry, optionally a plan), requests
(`researcher_requests`, approved by an admin) and admins adding a user.

Domain rules rely on verified email addresses: logins without
`email_verified` are refused anyway (`coder-identity.md` §7).

## 3. Limits

Per researcher, from a **plan** (`plans`: `jobs`, `unitsPerJob`, `units`,
`codersPerJob`, `answersPerJob`; missing or null is no limit):

1. their own plan (`users.plan_id`), else
2. the most generous of their email domains' plans, else
3. the server's default plan (`server_settings.default_plan_id`);

then their personal overrides (`users.limits`). A job's limits are its
owner's (`jobs.owner_id`); jobs without an owner have none.

Checked when something is added (`shared/limits.ts`): creating a job, an
upload with new units, a new coder (`job_full`; existing coders go on),
answers (the job's answer rows, counted at most once a minute per server
process, so the limit is approximate). Nothing is removed when limits shrink.

Server-wide (`server_settings`): the largest unit (`unit_bytes`, default
256 KB) and answer (`answer_bytes`, 64 KB), so one unit (e.g. an image as
base64) can't fill the server; and request body limits (`app.ts`: 2 MB for
coders, 256 MB for researchers' uploads).

## 4. Admins

Admins see accounts and what jobs hold (counts), not job data; to work in a
job they need a job role like anyone else. They can:

- change roles, plans and limits; add users before their first login;
- **block** a user: sessions end, logins are refused (`loginError=blocked`),
  API keys stop working;
- **suspend** a job: coders are refused (`job_suspended`), researchers can't
  change it, but can still read and download data, delete coders' data and
  delete the job; move a job to another **owner**.

Every admin change is logged (`admin_log`).

## 5. Second factor

`ANNOTINDER_REQUIRE_MFA=1` (recommended) requires a login with a second
factor (the ID token's `amr`) for researcher and admin access. Logging in
without one still works for coding, and `GET /me` says `mfaRequired`. The
session records it (`sessions.mfa`); API keys count as having one, since
making one needs it.

Today second factors are the login provider's: AnnoTinder doesn't store
them, so losing one is solved there. Planned (`plans/passkeys.md`):
AnnoTinder confirms a passkey itself, as a second layer independent of the
provider, with recovery codes and admin resets instead of email recovery;
and, for AmCAT and AnnoTinder on one server, AnnoTinder reading AmCAT's
login cookie.

## 6. Open points

- Groups other than email domains (e.g. a list of users sharing a plan).
- Limits on total storage in bytes (now: counts, plus per-unit and
  per-answer sizes).
- Rate limits per IP or account (`architecture.md` §10).
