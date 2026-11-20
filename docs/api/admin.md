# Admin API

The server admin's endpoints (account role `admin`, `docs/accounts.md`),
under `/api/admin/...`, with the researcher API's authentication (session
cookie or API key; a session needs a login with the second factor, and the sensitive actions
below need a recent one in a web session, never an API key: `security.md` §1). Called by the
client's server admin page (`ServerAdmin.tsx`, through `api/serverApi.ts`).

- Contracts: `adminEndpoints` in
  [`contracts/src/endpoints/admin.ts`](../../packages/contracts/src/endpoints/admin.ts),
  schemas in [`contracts/src/admin.ts`](../../packages/contracts/src/admin.ts).
- Implementation: [`server/src/researcher/admin.ts`](../../packages/server/src/researcher/admin.ts),
  with [`shared/accounts.ts`](../../packages/server/src/shared/accounts.ts) (registration, limits)
  and [`shared/limits.ts`](../../packages/server/src/shared/limits.ts) (checks).

Admins don't get study data here: no designs, units or answers. Every
change is written to the admin log (`listAdminLog`). Non-admins get 403
`admin_required`.

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
| listUsers | `GET /admin/users?q=` | – | `AdminUserSchema[]` (at most 200) |
| createUser | `POST /admin/users` | `AdminUserCreateSchema` | `AdminUserSchema` (201) |
| updateUser | `PUT /admin/users/:id` | `AdminUserUpdateSchema` | `AdminUserSchema` |
| deleteInvitation | `DELETE /admin/users/:id` | – | – (409 for a registered user) |
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
  block themselves or take away their own admin role (409). Giving or
  taking the `admin` role is sensitive: 403 `step_up_required` or
  `not_with_api_key`.
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
  in yet), with its roles.
- **updateAdminStudy**: `suspended` (the runtime is dropped, coders get 403
  `study_suspended`), `owner` (a researcher's email: whose limits the study
  counts against).
