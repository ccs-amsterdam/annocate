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
(`coder-identity.md` §5). **A study's expert coders are not users**: they
are rows of the study's `coders` (`coder-identity.md` §2), with a coder id
and, where the researchers gave one, an email address to sign in with. That
address is stored with the study before its owner ever logs in (the privacy
statement says so, `legal/privacy-statement.md` §4), gives no role and no
account, and goes when the coder or the study is deleted. A coder who signs
in gets an account like anyone who logs in; which coder they are is decided
by the study's `coders.email` at that moment, not by the account.

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
- addresses in `ANNOTINDER_ADMINS` get the admin role at each login, if the
  provider confirmed the address (also with
  `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION`: an unconfirmed address names no
  admin).

An **API key** never has the admin role: an admin's key works as a
researcher's (`security.md` §1).

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
  Linking works only from a session of the previous provider, for a user
  without a login at the new one, with a recent login (the server asks for
  one first), and the new provider must ask for the login then and there; a
  login that is someone else's already is refused (`link_failed`;
  `security.md` §1, "Linking a login").
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
`codersPerStudy`, `answersPerStudy`; null is no limit; and `crowdSignIn`,
below):

1. their own plan (`users.plan_id`), else
2. the most generous plan of their email domains (`domain_plans`), else
3. the server's default plan;

then their personal overrides (`users.limits`). A study counts against its
owner's limits (`studies.owner_id`).

**Crowd sign-in** (`crowdSignIn`, a yes or no with the limits): whether a
crowd's coders may choose to sign in in the researcher's studies, to
continue on other devices (`coder-identity.md` §5). Off unless a plan has
it on: a plan without it, and no plan at all, mean off, and the default
plan a fresh server is made with has it off. It is resolved like the
limits: the researcher's own plan, else their email domains' plans (on in
any of them is on: the most generous), else the default plan; and their own
setting, on or off, goes over any plan's. It is read from the **study's
owner**, each time a session asks, so changing a plan applies to running
studies at once (and never removes an email a session already has). Expert
coders can always sign in. Admins set it with the limits: a checkbox per
plan (*Server admin › Plans*), and "the plan's / yes / no" in a user's own
limits (*Users*).

Checked when something is added (`shared/limits.ts`): a study, new units, a
new coder (`study_full`; existing coders go on), answers (counted at most once
a minute per process, so approximate). Nothing is removed when limits shrink.

Server-wide (`server_settings`): the largest unit (default 256 KB) and answer
(64 KB); larger ones answer 413 `unit_too_large` or `answer_too_large`.

**Request bodies** have a size limit per route (`shared/bodyLimit.ts`); a
larger one answers 413 `request_too_large`:

| Requests | Largest body |
| --- | --- |
| A units upload (`POST /study/:id/units`), a study import, a study from a recipe | 256 MB |
| The rest of the researcher API (`/study/...`: designs, sets, settings) | 4 MB |
| The coder API (`/d/...`: a coder sends one unit's answers at a time) | 2 MB |
| The admin API (`/admin/...`) | 1 MB |
| Everything else (`/me`, a coder's account requests, logging out) | 64 KB |

A proxy in front can have a lower limit of its own (Cloudflare: 100 MB,
`hosting.md`).

## 4. Admins

Admins see accounts and study counts, not study data; to work in a study they
need a study role like anyone else. They can:

- change account roles, plans and limits; invite users by email and withdraw
  unclaimed invitations; restore roles the safeguards turned off;
- **block** a user: sessions end, logins are refused, API keys stop working;
- **delete** a registered user's account (§5);
- **suspend** a study: coders are refused (`study_suspended`), and so is
  every change by its researchers (403 `study_suspended`). They can still
  read and download, delete coders' data, postpone a coder's deletion
  request, and delete the study;
- move a study to another **owner** (a researcher on the server).

Every admin change is logged (`admin_log`). Changes of who is an admin are
sensitive actions (`security.md` §1). The admin API needs a web session: an
API key is never an admin.

## 5. Deleting a study or an account

Both can't be undone, so both are sensitive actions (a web session with a
recent login, never an API key) and ask to type what goes; the server checks
what was typed (400 `confirmation_mismatch`).

**A study** (*Settings*, or the studies list; `DELETE /study/:id` with
`{ confirm: <the study's name> }`; the study's ADMINs): its design versions,
units, links, coders, answers and stored results downloads go, and coders'
links stop working. Logged in the security log (`study_deleted`).

**An account** (the account menu, *Delete account*; `DELETE /me` with
`{ confirm: <the email address> }`): the user with their logins, sessions,
roles in studies, API keys and security log. The dialog first says what
happens to their studies (`GET /me/deletion`):

| The user's part in a study | What happens |
| --- | --- |
| Owner, and nobody else has a role in it (no other user, no invitation, no email domain) | **Deleted** with the account, with all its data. The dialog lists these studies |
| Owner, and others have a role in it | **Keeps the account** (`shared`): delete the study, take the others' roles away, or ask a server admin to give it another owner |
| Not the owner, but its only ADMIN | **Keeps the account** (`last_admin`): give another user the ADMIN role first |
| Any other role in someone else's study | The role goes; the study stays |

The server's **only admin** can't delete their account either: make another
user admin first. While something keeps the account, deleting answers 409
(`account_has_studies` or `last_admin`) and nothing is deleted. So a study
others work in never disappears with someone's account, and no study is left
without an ADMIN.

A server admin deletes a registered user's account the same way (*Server
admin › Users*; `GET /admin/users/:id/deletion`, `DELETE /admin/users/:id`
with the user's email address as `confirm`): the same rules, the same typed
confirmation. Not their own account (409: that is done from the account
menu). It is logged in `admin_log` with the studies that went.

Coders' data is deleted per study (`coder-identity.md` §8), not here.

## 6. Second factor

Researchers work without it; server admin access needs it, and `GET /me`
says how things stand (`twoFactor`). The session records it (`sessions.mfa`,
`sessions.auth_time`). Sensitive actions need it recent and never work with an
API key (`security.md` §1).

## 7. Open points

- Groups other than email domains (e.g. a list of users sharing a plan).
- Limits on storage in bytes.
