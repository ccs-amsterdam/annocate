# Accounts, registration and limits

Identities and roles follow the lab's Authentication standard. Complements `security.md` (login),
`coder-identity.md` (coders) and `api/admin.md` (the endpoints).

AnnoTinder is meant to be hosted for many researchers: a public server,
and servers for groups that need stability or stricter data protection. A
server decides who may create studies, how much they may store, and who
manages that.

## 1. Users and identities

AnnoTinder follows the Societal Analytics Lab's Authentication standard
(lab-infra `docs/auth.md`, "Authorization"; login: `security.md` §1).

- **A user is an identity, not an email address.** The identity is the
  login provider (`iss`) and the user there (`sub`): `identities`. Roles
  belong to the user, so they stay when the email address changes at the
  provider; each login updates `users.email` (`loginUser`,
  `shared/accounts.ts`). Another login with an address someone used before
  is someone else.
- **The email address is how people find each other**: giving a colleague a
  study role, an admin inviting a researcher. The role goes to the user who
  owns the address now, or, if nobody has logged in with it yet, to a
  **shadow user** (`users.registered_at` NULL): an invitation.
- **JIT account claiming**: the first login with a verified email address
  that has a shadow user claims it (its roles and plan become the user's).
  A user whose address changes to one with a shadow user claims that too.
- `users`: `email` (latest login), `registered_at`, `last_login_at`,
  `has_mfa` (the latest login had the second factor), `reactivated_at`
  (the first login after a year away).

Coders need no account at all, unless a link asks them to log in
(`coder-identity.md` §5).

## 2. Roles

One table, `roles`. Where: the server (`study_id` NULL) or a study. Who: a
user (`user_id`, IBAC), users with a verified email at a domain
(`email_domain`: `uni.nl`, or `*.uni.nl` with subdomains; ABAC), both (a
user, only while at that domain), or neither: every user
(`require_email`: only with an email address). `granted_at`: when it was
given, changed or restored.

- **Study roles** (`READ`, `WRITE`, `ADMIN`): what someone may do in one
  study, given by the study's ADMINs (*Team*; `PUT /study/:id/users`). A
  study's creator gets `ADMIN`.
- **Account roles** (server): `researcher` also creates and owns studies
  (their limits apply); `admin` also manages accounts, limits and
  registration (`api/admin.md`). Without one, a logged-in user is a `user`:
  codes, and works on studies they have a study role in (a student
  assistant editing a design is a user with `WRITE` on that study).
- **Admin roles only per user**: never by domain or for everyone (a check
  in the table). Giving or taking them is a sensitive action (`security.md`
  §1).

So "can edit studies" is a study role, and "can create studies" an account
role. The database functions `role_applies`, `account_role` and
`study_role` (migration `0005`) decide, so every query applies the same
rules.

**Who becomes a researcher**, all as role rows:

- an admin invites them by email (*Server admin › Users*), or makes an
  existing user one;
- their verified email is at a researcher domain (*Registration*);
- registration is open: every user with an email address;
- an admin approves their request (`researcher_requests`);
- emails in `ANNOTINDER_ADMINS` get the admin role at each login (the first
  admins; admins can make more).

### Safeguards

A role of a user's own does not apply (lab standard, "Safeguards against
email reassignment"):

- **Dormant users**: given before they came back after more than a year
  away (`reactivated_at`), while their latest login had no second factor.
  With the second factor always required this is rare.
- **Expired invitations**: claimed more than 3 months after it was given
  (`registered_at > granted_at + 3 months`). An unclaimed invitation shows
  as expired after 3 months; its roles don't move to a user who claims it.

Admins see both (*Server admin › Users*: "invitation expired", "roles
off") and can restore them (`restoreRoles`); a study's ADMINs restore a
study role (*Team*, `restore`). Restoring sets `granted_at` to now.

### Changing providers

A new login provider means new identities (lab-infra
`docs/auth-migration.md`). Two ways:

- **Account linking** (for servers with important data): move the
  provider's settings to `OIDC_PREVIOUS_*`, set the new one, and an end
  date (`OIDC_PREVIOUS_UNTIL`; `hosting.md`). Until then the login screen
  also offers the previous provider; whoever logs in with it is asked to
  link their login at the new one (`/auth/login?link=1`), which adds that
  identity to their account. *Server admin* warns while the migration
  runs and shows who hasn't linked yet.
- **JIT re-claiming**: `pnpm --filter @annotinder/server identities reset
  --yes` forgets all identities: every user becomes a shadow user, claimed
  by the next login with their verified email (within 3 months, the
  safeguards above). Relies on email ownership, so prefer linking. Also the
  fallback for who missed the linking period.

Domain roles and claiming rely on verified email addresses: logins without
`email_verified` are refused.

## 3. Limits

Per researcher, from a **plan** (`plans`: `studies`, `unitsPerStudy`, `units`,
`codersPerStudy`, `answersPerStudy`; missing or null is no limit):

1. their own plan (`users.plan_id`), else
2. the most generous of their email domains' plans (`domain_plans`), else
3. the server's default plan (`server_settings.default_plan_id`);

then their personal overrides (`users.limits`). A study's limits are its
owner's (`studies.owner_id`); studies without an owner have none.

Checked when something is added (`shared/limits.ts`): creating a study, an
upload with new units, a new coder (`study_full`; existing coders go on),
answers (the study's answer rows, counted at most once a minute per server
process, so the limit is approximate). Nothing is removed when limits shrink.

Server-wide (`server_settings`): the largest unit (`unit_bytes`, default
256 KB) and answer (`answer_bytes`, 64 KB), so one unit (e.g. an image as
base64) can't fill the server; and request body limits (`app.ts`: 2 MB for
coders, 256 MB for researchers' uploads).

## 4. Admins

Admins see accounts and what studies hold (counts), not study data; to work in a
study they need a study role like anyone else. They can:

- change account roles, plans and limits; invite users by email (a shadow
  user until their first login), and withdraw an unclaimed invitation;
  restore roles the safeguards turned off;
- **block** a user: sessions end, logins are refused (`loginError=blocked`),
  API keys stop working;
- **suspend** a study: coders are refused (`study_suspended`), researchers can't
  change it, but can still read and download data, delete coders' data and
  delete the study; move a study to another **owner**.

Every admin change is logged (`admin_log`).

## 5. Second factor

Researcher and admin access always needs the login provider's second
factor (`OIDC_MFA_CLAIM`); a login without it still works for coding, and
`GET /me` says so (`twoFactor`). The session records it (`sessions.mfa`,
`sessions.auth_time`). Sensitive actions (API keys, deleting answers or
coders' data or a study, admin roles) need it recent (step-up), and never
work with an API key: `security.md` §1.

## 6. Open points

- Groups other than email domains (e.g. a list of users sharing a plan).
- Limits on total storage in bytes (now: counts, plus per-unit and
  per-answer sizes).
