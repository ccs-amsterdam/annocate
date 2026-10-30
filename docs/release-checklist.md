# Release checklist

Where AnnoTinder stands before a first release (2026-10-30): what is done
and checked, what needs a decision, and what is open. Items marked
**decide** need the maintainer's choice; the rest are work.

## 1. Done and checked

- **Server**: one Node server (Hono) with Postgres (PGlite for development
  and tests), researcher API (`api/researcher.md`) and coder API
  (`api/coder.md`). Stateless apart from each live job's deployment spec:
  several processes can share a database (`architecture.md` §3), with the
  exceptions in §4 below.
- **Accounts**: OIDC login, API keys, roles (user / researcher / admin),
  registration rules, plans and limits, admin UI, audit log, MFA via the
  provider's `amr` (`accounts.md`).
- **Coding**: question types, unit loops with four distribution modes,
  batches of units with answers saved in the background, soft pause,
  closing sessions, quitting and deletion requests, transfer to another
  device, coder login on invitations, URL parameters and panels.
- **Results**: zip export (annotations with labels, coders, unit versions,
  variables, README), paged annotations API.
- **Hosting**: Dockerfile, Compose with optional Caddy TLS, `/health`
  (`hosting.md`).
- **Examples**: six example jobs (`plans/examples.md`), the "From an
  example" dialog.
- **Help**: help topics in the app, docs in `docs/`.

### Tests (all green on 2026-10-30)

| Suite | Count | Command |
| --- | --- | --- |
| Contracts (unit) | 82 | `pnpm test` |
| Client (unit) | 229 | `pnpm test` |
| Server (unit and API) | 124 | `pnpm test` |
| End-to-end (Playwright) | 11 | `pnpm test:e2e` |

The e2e tests (`packages/e2e`) run a browser against a server with a
fresh database and the built client:

- coders swipe, fill in a survey with a screen-out, code an experiment,
  and select and label spans;
- sessions quit with a deletion request, move to another device, see a
  pause, and follow a new codebook version;
- the researcher creates jobs from an example and from a CSV through the
  UI, edits the codebook, publishes, invites, and downloads the zip.

Found and fixed while writing them: the scale question's submit button had
no accessible name.

### Security pass

Researcher auth was reviewed by hand, and the server by an independent
second read. No cross-job or cross-coder read or write was found. The
review checked:

- authorization on every route, including roles per job and the admin
  routes;
- job scoping of every id in a path or body;
- CSRF (the `x-annotinder` header; CORS without credentials);
- cookies (httpOnly, SameSite=Lax, Secure behind TLS);
- OIDC (PKCE, state, nonce, verified email);
- preview and transfer tokens;
- SQL parameters;
- markdown rendering and the `::html` sandbox;
- redirect URLs;
- error messages;
- body sizes.

Fixed:

- A unitset could list units of another job. Nothing leaked, because every
  read is scoped to the job, but counts were wrong and coders were handed
  missing units.
- Job users' emails were stored as typed. "Anna@Uni.nl" had no access.
- Deployment ids with leading zeros (`/d/01`, `/d/001`, …) each made a
  runtime in memory, without authentication.
- Unknown invite secrets were cached: up to 10k entries, any length.
- URL parameter values are now at most 256 characters. This also bounds the
  pattern match on what a coder sends.
- Redeeming a transfer link now re-checks suspension.
- `Codings.record` copied a coder's list on every coding, which grew
  quadratically.

### Load test

Postgres 17 in Docker; `packages/server/scripts/load-test.mjs`. Results
are in `hosting.md` "Capacity".

The setup: 10,000 units in a shared queue and 300 simulated coders. At a
realistic pace, fetching the next 5 units takes 26 ms (p50) and 79 ms
(p99), and saving a unit takes 10 ms. No unit was coded more often than
its `maxCoders`.

Fixed along the way:

- **The connection pool starved.** Requests waiting for a queue's lock held
  every connection, so saving took 2 s.
- **Units went past `maxCoders`.** A pick could miss a unit finished during
  it; this happened 75 times in one run. It now has a regression test.
- **Leases were never removed**, so they only accumulated.
- **Picks were slow.** They sorted all units and parsed timestamps.

One shared queue serves about 25 picks per second at 10k units, fewer as
codings grow. That is plenty at a realistic pace. Beyond it, see
`architecture.md` §10 item 11.

## 2. Decisions needed

1. **Second factor and a login shared with AmCAT** (`plans/passkeys.md`)
   — **decide**. Recommended: option 1, single sign-on through one OIDC
   provider that reports `amr`/`acr`, with `ANNOTINDER_REQUIRE_MFA`. Option
   2 is a shared login cookie. Nothing is built for either. Until this is
   decided, MFA is whatever the provider enforces.
2. **Optional-login links link a login without asking** — **decide**. On
   an invite with `auth: "optional"`, a browser that is already logged in
   gets that email linked to the new session on its first request. This
   happens to a researcher trying the link, or to a coder logged in for
   another job. `coder-identity.md` says optional means the coder chooses.
   Proposed fix: link only after the coder clicks "Log in" (the client sends
   a header after the login round trip). This touches the identity flow, so
   it is not changed yet.
3. **Repeated sessions with a participant id** — **decide**. A known
   participant id plus "start a new session" makes a new coder without
   counting against `maxUses`. So a personal link with `maxUses: 1`, or a
   participant who was screened out or quit, can start again. Each new
   session also redraws `random`/`balanced` assignments, which skews the
   balance. This is documented as a feature, a participant who lost their
   first device. Options:
   - count these sessions against `maxUses`;
   - allow at most N per participant;
   - refuse after a screen-out or quit.
4. **Coders receive the whole codebook** — **decide**. Every question,
   option, condition and end item goes to every coder's browser, including
   branches they never see. That matters once hidden fields and gold
   answers exist (`plans/gold-checks.md`), and for experiments whose
   conditions should not be visible. Options:
   - send only what the coder's route needs;
   - document it as a property.
5. **Security headers and framing** — **decide**. The server sends no
   `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`,
   `X-Content-Type-Options` or `Referrer-Policy`. Framing depends on
   embedding in AmCAT. Recommended: `nosniff` and
   `frame-ancestors 'self'` (plus AmCAT's origin when needed) now, and a
   CSP once the embedding is clear. The CSP needs care with Monaco's workers
   and inline styles, and with the `::html` iframe's `srcdoc`.
6. **CSV formula injection in exports** — **decide**. Coders' text and
   participant ids go into CSV files as written. A value starting with `=`,
   `+`, `-` or `@` runs as a formula when the file is opened in Excel.
   Options:
   - prefix such cells with `'`, which changes the data for R and Python
     users;
   - a warning in the README of the zip (recommended);
   - an option at download.
7. **Rate limiting** — **decide**. There is none in the server. Anyone
   with an open link can create sessions, up to `maxUses` or the plan's
   `codersPerJob`. Recommended: limit `/d/*/session` per IP at the proxy
   (nginx `limit_req`; Caddy needs a rate-limit plugin) and document it in
   `hosting.md`.
8. **Migration reset** — the migrations (`packages/server/migrations`,
   0001–0020) are reset to one initial migration before the release, as
   planned. Any test server's data is lost then.

## 3. Open items (work)

From the review list:

- Layouts haven't been checked with `position: fixed` content (in `::html`
  and in style blocks).
- The scale question's "Grid (columns)" layout label is unclear.
- Relation questions' dropdowns show values, not labels.
- Relation validation doesn't check for loops (A → B → A).
- Invite presets (panel URL parameters) aren't validated against the
  invite form's rules.
- The export's `codebook_id` is a database id. It should be a version
  number or be explained in the README.
- The admin UI has 55 form labels not associated with their inputs
  (accessibility): `label` without `htmlFor`, or inputs without `id`.

From the security review, low:

- API keys always count as MFA. A key made from a login without a second
  factor, before `ANNOTINDER_REQUIRE_MFA` was turned on, keeps full access.
  Fix: store an `mfa` flag per key, or revoke keys when the setting is
  turned on.
- The routing check for unitset templates is wider than documented.
  `part_{$var.x}` accepts any unitset named `part_*`; a bare `{$var.x}`
  accepts every unitset. Fix: when the variable has options, check against
  the possible names.
- A coder deleted while their request is in flight could leave orphan
  coder-level answers: `annotation_values.coder_id` has no foreign key.
  Fix: a foreign key with `ON DELETE CASCADE` (part of the migration reset).
- `coder_deletions` keeps the deleted coder's email and participant id, so
  "delete for good" still keeps who was deleted. **Decide** whether that
  log is intended.
- A researcher-written URL parameter pattern could backtrack
  catastrophically on a crafted value, blocking the server. Values are
  capped at 256 characters. Fix: a linear regex engine (RE2) or a check for
  nested quantifiers.

Several server processes:

- Researcher previews live in one process's memory. Behind a load
  balancer, a preview's requests must reach the same process (sticky
  sessions), or previews move to the database.
- A job's limit on answers (`answersPerJob`) is counted per process.
- Picks from one shared queue are serialized across processes by the
  database lock. More processes add no throughput for one queue (§1, load
  test).

Development and tests:

- A long-running development server whose dev user creates many jobs hits
  the default plan's limit of 20 jobs. The e2e tests start a fresh database
  each run, so they don't.
- The e2e tests drag-select with the mouse just inside a phrase's edges:
  headless Chromium sometimes starts no selection from a character's exact
  middle. This is not an app problem; manual drag-selection works.

## 4. Recommendations for the first release

1. Decide §2 items 1, 2 and 5 before inviting anyone outside the team:
   they are about logins and the browser's security model.
2. Reset the migrations (§2 item 8), with the `annotation_values` foreign
   key from §3.
3. Run one server process at first (previews and answer limits are
   per-process). Put a proxy in front with TLS and, where it can, a rate
   limit on `/d/*/session`.
4. Set `ANNOTINDER_SECRET`, `ANNOTINDER_REQUIRE_MFA=1` and
   `ANNOTINDER_ADMINS`. Never set `ANNOTINDER_DEV_AUTH` or
   `ANNOTINDER_DEMO`.
5. Back up the database daily (`hosting.md` "Backups"), and test a restore
   once.
6. Run `pnpm test`, `pnpm test:e2e` and the load test against the release
   build.
7. Consider the setup wizard (`plans/setup-wizard.md`) after the first
   users, informed by where they get stuck.
