# Accounts, registration and limits

Who may create studies on a server, how much they may store, and who manages
that. Follows the lab's Authentication standard. See also `security.md`
(login), `coder-identity.md` (coders) and `api/admin.md` (endpoints).

## 1. Users and identities

- **A user is an identity, not an email address**: the provider (`iss`) and
  the user there (`sub`), in `identities`. Roles belong to the user, so they
  survive an address change; each login updates `users.email` (`loginUser`,
  `shared/accounts.ts`). A different login with an address someone used
  before is someone else.
- **The email address is how people find each other**: giving a colleague a
  study role, an admin inviting a researcher. The role goes to the user who
  owns the address now, or else to a **shadow user** (`users.registered_at`
  NULL): an invitation.
- **Claiming**: the first login with a verified address that has a shadow
  user claims it (its roles and plan become the user's).
- `users` also has `email_verified`, `last_login_at`, `has_mfa` (the latest
  login had a second factor) and `reactivated_at` (the first login after a
  year away).

Coders need no account unless their link asks them to log in
(`coder-identity.md` §5).

## 2. Roles

One table, `roles`. Where: the server (`study_id` NULL) or a study. Who: a
user (`user_id`), users with a verified email at a domain (`email_domain`:
`uni.nl`, or `*.uni.nl` with subdomains), both (a user while at that domain),
or everyone (`require_email`: only with an address). `granted_at`: when given,
changed or restored.

| Role | Kind | May |
| --- | --- | --- |
| `READ`, `WRITE`, `ADMIN` | study role, given by the study's ADMINs (*Team*, `PUT /study/:id/users`) | work in that study; the creator is `ADMIN` |
| `user` | account role (default) | code, and work on studies they have a study role in |
| `researcher` | account role | also create and own studies, within their limits |
| `admin` | account role, only per user (never by domain or for everyone) | also manage accounts, limits and registration (`api/admin.md`); giving or taking it is a sensitive action |

So "can edit studies" is a study role and "can create studies" an account
role. Role resolution is shared SQL (`roleApplies`, `accountRole`, `studyRole`
in `server/src/db/sql.ts`), so every query applies the same rules.

**Who becomes a researcher** (all role rows):

- an admin invites them by email (*Server admin › Users*) or upgrades a user;
- their verified email is at a researcher domain (*Registration*);
- registration is open: everyone with an email address;
- an admin approves their request (`researcher_requests`);
- addresses in `ANNOTINDER_ADMINS` get the admin role at each login.

### Safeguards

Against reassigned email addresses (lab standard), a user's own role does not
apply when:

- **Dormant user**: it was given before they came back after more than a year
  away (`reactivated_at`), while their latest login had no second factor.
- **Expired invitation**: it was claimed more than 3 months after it was given.
  Unclaimed invitations show as expired after 3 months.

Admins see both (*Users*: "invitation expired", "roles off") and can restore
them (`restoreRoles`); a study's ADMINs restore study roles (*Team*,
`restore`).

### Changing providers

A new provider means new identities (lab-infra `docs/auth-migration.md`).
Two ways:

- **Account linking** (servers with important data): move the provider's
  settings to `OIDC_PREVIOUS_*`, set the new one and an end date
  (`OIDC_PREVIOUS_UNTIL`; `hosting.md`). Until then the login screen also
  offers the previous provider, and whoever uses it is asked to link their new
  login (`/auth/login?link=1`). *Server admin* shows who hasn't linked yet.
- **Re-claiming by email**: `pnpm --filter @annotinder/server identities reset --yes`
  (in the container: `node dist/identities.js reset --yes`) forgets all
  identities; every user becomes a shadow user, claimed by their next login
  within 3 months. Relies on email ownership, so prefer linking; also the
  fallback for those who missed the linking period.

Claiming and domain roles rely on verified addresses. With
`AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` (`security.md` §1) unverified users
can still claim invitations, but domain roles and roles for everyone skip
them.

## 3. Limits

Per researcher, from a **plan** (`plans`: `studies`, `unitsPerStudy`, `units`,
`codersPerStudy`, `answersPerStudy`; null is no limit):

1. their own plan (`users.plan_id`), else
2. the most generous plan of their email domains (`domain_plans`), else
3. the server's default plan;

then their personal overrides (`users.limits`). A study counts against its
owner's limits (`studies.owner_id`).

Checked when something is added (`shared/limits.ts`): a study, new units, a
new coder (`study_full`; existing coders go on), answers (counted at most once
a minute per process, so approximate). Nothing is removed when limits shrink.

Server-wide (`server_settings`): the largest unit (default 256 KB) and answer
(64 KB), and request bodies (`app.ts`: 2 MB for coders, 256 MB for researcher
uploads).

## 4. Admins

Admins see accounts and study counts, not study data; to work in a study they
need a study role like anyone else. They can:

- change account roles, plans and limits; invite users by email and withdraw
  unclaimed invitations; restore roles the safeguards turned off;
- **block** a user: sessions end, logins are refused, API keys stop working;
- **suspend** a study: coders are refused (`study_suspended`); researchers can
  still read, download, delete coders' data and delete the study;
- move a study to another **owner**.

Every admin change is logged (`admin_log`).

## 5. Second factor

Researchers work without it; server admin access needs it, and `GET /me`
says how things stand (`twoFactor`). The session records it (`sessions.mfa`,
`sessions.auth_time`). Sensitive actions need it recent and never work with an
API key (`security.md` §1).

## 6. Open points

- Groups other than email domains (e.g. a list of users sharing a plan).
- Limits on storage in bytes.
