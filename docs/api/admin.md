# Admin API

The server admin's endpoints, under `/api/admin/...`, for users with the
account role `admin` (`docs/accounts.md`). Called by the server admin page
(`ServerAdmin.tsx`, through `api/serverApi.ts`).

- Authentication: the session cookie of an admin (with `x-annotinder: 1`),
  from a login with the second factor; without one, 403 `mfa_required`. The
  sensitive actions below need a recent login too (403 `step_up_required`;
  `security.md` §1).
- **Not with an API key**: a key works as a researcher at most, also an
  admin's, so every endpoint here answers a key 403 `admin_required`.
- Non-admins get 403 `admin_required`. Admins get no study data here (no
  designs, units or answers). Every change goes to the admin log.
- Errors as everywhere ([README](README.md#errors)). Rate limits: the
  researcher API's (`security.md` §3).
- Contracts: `adminEndpoints` in
  [`contracts/src/endpoints/admin.ts`](../../packages/contracts/src/endpoints/admin.ts),
  schemas in [`contracts/src/admin.ts`](../../packages/contracts/src/admin.ts).
  Implementation: [`server/src/researcher/admin.ts`](../../packages/server/src/researcher/admin.ts)
  and one file per section next to it (`admin.settings.ts`, `admin.plans.ts`,
  `admin.users.ts`, `admin.requests.ts`, `admin.studies.ts`, `admin.log.ts`),
  with `shared/adminQueries.ts`, `shared/accounts.ts` and `shared/limits.ts`.

| Endpoint | | Request | Response |
|---|---|---|---|
| getWarnings | `GET /admin/warnings` | – | `ServerWarningSchema[]` |
| getSettings | `GET /admin/settings` | – | `ServerSettingsSchema` |
| putSettings | `PUT /admin/settings` | `ServerSettingsSchema` | `ServerSettingsSchema` |
| listPlans | `GET /admin/plans` | – | `PlanSchema[]` |
| createPlan | `POST /admin/plans` | `PlanWriteSchema` | `PlanSchema` (201) |
| updatePlan | `PUT /admin/plans/:id` | `PlanWriteSchema` | `PlanSchema` |
| deletePlan | `DELETE /admin/plans/:id` | – | – (409 for the default plan) |
| listDomains | `GET /admin/domains` | – | `DomainRuleSchema[]` |
| putDomain | `PUT /admin/domains/:domain` | `DomainRuleWriteSchema` | `DomainRuleSchema` |
| deleteDomain | `DELETE /admin/domains/:domain` | – | – |
| listUsers | `GET /admin/users?q=` | – | `{ users: AdminUserSchema[], next? }` (a [list](README.md#lists); 200 at a time unless `limit` says otherwise) |
| createUser | `POST /admin/users` | `AdminUserCreateSchema` | `AdminUserSchema` (201) |
| updateUser | `PUT /admin/users/:id` | `AdminUserUpdateSchema` | `AdminUserSchema` |
| deleteInvitation | `DELETE /admin/users/:id` | – | – (a user who hasn't logged in yet) |
| getUserDeletion | `GET /admin/users/:id/deletion` | – | `AccountDeletionSchema` |
| deleteUser | `DELETE /admin/users/:id` | `ConfirmDeletionSchema` | – (a registered user) |
| listResearcherRequests | `GET /admin/requests` | – | `ResearcherRequestSchema[]` |
| decideResearcherRequest | `POST /admin/requests/:userId` | `{ approve }` | – |
| listAdminStudies | `GET /admin/studies` | – | `AdminStudySchema[]` |
| updateAdminStudy | `PUT /admin/studies/:id` | `AdminStudyUpdateSchema` | `AdminStudySchema` |
| listAdminLog | `GET /admin/log` | – | `AdminLogEntrySchema[]` (newest 500) |

Notes:

- **warnings**: what makes the server less secure (`2fa_not_required`,
  `email_verification_not_required`, `unverified_roles`, `no_2fa_signal`,
  `migration_not_finished`; `security.md` §1 "Hardening warnings").
- **settings**: `registration` (`open`: every user with an email address
  is a researcher, a role row for everyone; `requests`: users can ask), `defaultPlanId`, and the largest
  unit (`unitBytes`) and answer (`answerBytes`), in bytes of JSON.
- **domains**: `uni.nl` matches that domain, `*.uni.nl` also its
  subdomains. `researcher`: users with a verified email there are
  researchers (a role row by domain, `docs/accounts.md` §2); `planId`:
  their plan (the most generous of several).
- **updateUser**: fields left out stay. `limits` replaces the user's
  overrides (`{}` clears them; `null` for a limit is no limit). `blocked`
  ends their sessions; API keys stop working while blocked. An admin can't
  block themselves or take away their own admin role (409). Every change
  of who is an admin is sensitive (403 `step_up_required` without a recent
  login): giving or taking the `admin` role, and blocking, unblocking or
  restoring the roles of a user who holds it.
- **listUsers**: per user also where their account role comes from
  (`roleVia`: their own role, their `domain`, or `everyone`), whether they
  logged in yet (`registered`; else an invitation, `invitationExpired`
  after 3 months), roles the safeguards turned off (`rolesDisabled`),
  whether their latest login had the second factor (`hasMfa`), and, while
  the server moves to another login provider, whether they linked a login
  there (`linked`).
- **createUser**: invites an email address: the role goes to the user who
  has it now, else to a shadow user that their first login claims
  (`docs/accounts.md` §1; the same address again is the same invitation).
  With role `admin`: sensitive, as above.
- **updateUser** `restoreRoles`: turns the roles the safeguards turned off
  on again (server and studies).
- **deleteInvitation**: withdraws an invitation (a user who hasn't logged
  in yet), with its roles. No body. Sensitive if the invitation is for the
  admin role.
- **getUserDeletion**: what deleting the user's account would do, as the
  researcher API's `getAccountDeletion` says it for one's own: `email` (the
  address to type), `studies` (deleted with the account: the ones they own
  and nobody else has a role in), `blocking` (studies that keep the account:
  `shared`, `last_admin`) and `lastAdmin` (the server's only admin). 404 for
  an unknown user.
- **deleteUser**: the same route as `deleteInvitation`, for a user who has
  logged in: deletes their account (logins, sessions, roles, API keys,
  security log) and the `studies` of `getUserDeletion`, as they would delete
  it themselves (`docs/accounts.md` §5). The body is
  `{ confirm: <the user's email address> }` (400 `confirmation_mismatch`).
  409 `account_has_studies` or `last_admin` while something keeps the
  account; 409 for your own account (delete that with the researcher API's
  `deleteAccount`). Always sensitive. The admin log gets the address and the
  studies that went.
- **listUsers** `q`: finds the text anywhere in the email address, as
  written (`%` and `_` are ordinary characters).
- **updateAdminStudy**: `suspended` (the runtime is dropped, coders get 403
  `study_suspended`, and so do the study's researchers for every change;
  they can still read, delete coders' data and delete the study), `owner`
  (the email of a registered researcher on this server, whose limits the
  study then counts against; 400 otherwise). 404 for an unknown study.
