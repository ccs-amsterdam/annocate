# Admin API

The server admin's endpoints (account role `admin`, `docs/accounts.md`),
under `/admin/...`, with the researcher API's authentication (session
cookie or API key; a required second factor applies). Called by the
client's server admin page (`ServerAdmin.tsx`, through `api/serverApi.ts`).

- Contracts: `adminEndpoints` in
  [`contracts/src/endpoints/admin.ts`](../../packages/contracts/src/endpoints/admin.ts),
  schemas in [`contracts/src/admin.ts`](../../packages/contracts/src/admin.ts).
- Implementation: [`server/src/researcher/admin.ts`](../../packages/server/src/researcher/admin.ts),
  with [`shared/accounts.ts`](../../packages/server/src/shared/accounts.ts) (registration, limits)
  and [`shared/limits.ts`](../../packages/server/src/shared/limits.ts) (checks).

Admins don't get job data here: no codebooks, units or answers. Every
change is written to the admin log (`listAdminLog`). Non-admins get 403
`admin_required`.

| Endpoint | | Request | Response |
|---|---|---|---|
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
| listResearcherRequests | `GET /admin/requests` | – | `ResearcherRequestSchema[]` |
| decideResearcherRequest | `POST /admin/requests/:userId` | `{ approve }` | – |
| listResearcherInvites | `GET /admin/researcher-invites` | – | `ResearcherInviteSchema[]` |
| createResearcherInvite | `POST /admin/researcher-invites` | `ResearcherInviteWriteSchema` | `ResearcherInviteSchema` (201) |
| revokeResearcherInvite | `POST /admin/researcher-invites/:id/revoke` | – | `ResearcherInviteSchema` |
| listAdminJobs | `GET /admin/jobs` | – | `AdminJobSchema[]` |
| updateAdminJob | `PUT /admin/jobs/:id` | `AdminJobUpdateSchema` | `AdminJobSchema` |
| listAdminLog | `GET /admin/log` | – | `AdminLogEntrySchema[]` (newest 500) |

Notes:

- **settings**: `registration` (`open`: anyone who logs in becomes a
  researcher; `requests`: users can ask), `defaultPlanId`, and the largest
  unit (`unitBytes`) and answer (`answerBytes`), in bytes of JSON.
- **domains**: `uni.nl` matches that domain, `*.uni.nl` also its
  subdomains. `researcher`: users there become researchers when they log
  in; `planId`: their plan (the most generous of several).
- **updateUser**: fields left out stay. `limits` replaces the user's
  overrides (`{}` clears them; `null` for a limit is no limit). `blocked`
  ends their sessions; API keys stop working while blocked. An admin can't
  block themselves or take away their own admin role (409).
- **createUser**: adds a user before they first log in (or changes the
  role of an existing one).
- **updateAdminJob**: `suspended` (the runtime is dropped, coders get 403
  `job_suspended`), `owner` (a researcher's email: whose limits the job
  counts against).
