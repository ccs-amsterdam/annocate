# Release checklist

What to check and decide before a pilot server and before a first release.
**Decide** marks an item that needs the maintainer's choice; the rest is
work. What exists is described in the other docs; this file lists only
what is open, plus the checks to repeat for every release.

## 1. Before a pilot server

1. **Login with a real provider.** Log in on a test server with the lab's
   provider (Keycloak): a researcher with the provider's second factor
   (`OIDC_MFA_CLAIM`), a step-up for a sensitive action, logging out, and
   a coder signing in to a study with sign-in `required` (`hosting.md`,
   `security.md` §1). The automated tests use a mock provider only.
2. **Email coders, by hand.** A design whose coder column holds email
   addresses: one link, sign-in required, each coder gets the units of
   their address and another address gets 403 `email_not_allowed`. Not
   covered by the e2e tests.
3. **The shared login provider.** `SHARED_OIDC_ISSUERS`
   (`server/src/shared/warnings.ts`) is empty: fill in the lab's shared
   issuer, so a server using it gets the hardening warning about shared
   logins (or remove the check). **Decide** which issuer.
4. **Server settings** (`hosting.md`): `ANNOTINDER_SECRET`,
   `ANNOTINDER_ADMINS`, the `OIDC_*` settings, `ANNOTINDER_PUBLIC_URL`, a
   proxy with TLS and `ANNOTINDER_TRUST_PROXY=1` (the compose file sets
   it). Never `AUTH_DEV_MODE` or `ANNOTINDER_DEMO`. One server process
   (previews and answer limits are per process, `architecture.md` §11).
5. **Backups**: daily (`hosting.md` "Backups"), and one test restore.
6. **Read `security.md`** before inviting anyone outside the team.

## 2. Decisions

1. **MCP branch** (`claude/annotinder-mcp`): rebase onto this branch
   before merging. Its `0006_oauth.sql` predates the Drizzle schema: its
   tables go into `server/src/db/schema/` and `db:generate` makes the
   migration. **Decide**:
   - token lifetimes (proposed: access 1 hour, refresh 30 days);
   - rate limits (proposed: client registration 10 per minute, other
     OAuth endpoints 600);
   - whether study admins see the MCP connections of their study's users;
   - whether a read-only connection requires the `READ` role.
2. **Coder link errors**: a link that needs a login answers 401
   `auth_required`, a login without access 403. **Decide** whether the
   status codes stay as they are for the R and Python clients.
3. **Balanced draws on a tie**: a balanced condition or computed variable
   gives the first value among those with the fewest sessions. **Decide**
   whether a tie should be broken at random.
4. **The deletion log** (`coder_deletions`) keeps a deleted coder's email
   and participant id, so "delete for good" still records who was
   deleted. **Decide** whether that is intended.
5. **Formatting**: there is a root `prettier` dependency but no format
   script, and the configured `prettier-plugin-tailwindcss` isn't
   installed. **Decide**: a `format` script with the plugin, or drop it.
6. **Texts**: the README, the welcome page and the "About AnnoTinder"
   help topic from `philosophy.md` (pending the maintainer).

## 3. Open work

- **R and Python clients** follow the researcher API's names: `study`
  (not job), `links`, `design` (design versions), everything under
  `/api`, computed variables (`POST /variables/computed/:name` in the
  coder API).
- **Answer keys**: the "Create gold values" dialog has no input for a
  range (`3..5`); ranges are typed in the cell.
- **Accessibility**: the researcher UI has about 55 form labels not linked
  to their inputs (`label` without `htmlFor`, or inputs without `id`).
- **Layouts** haven't been checked with `position: fixed` content (in
  `::html` and style blocks).
- The scale question's "Grid (columns)" layout label is unclear.
- Relation questions: the dropdowns show values rather than labels, and
  validation doesn't check for cycles (A → B → A).
- **The design viewer** (`plans/design-viewer.md`) needs real release
  versioning: the packages are at `0.0.0`.

Known limitations, documented rather than fixed:

- A running session keeps its sign-in state: changing the study's sign-in
  setting applies to new sessions.
- A link's settings are cached by the server for up to 60 seconds.
- A session that started from a link without a coder value, before the
  coder column had values, gets 409 `not_assigned`.
- A unit that a re-upload moves to another coder stays open to the coder
  who coded it (the other coder gets it too).
- A long-running development server's dev user hits the default plan's
  limit of 20 studies; the e2e tests start a fresh database each run.

## 4. Every release

1. Bump `RELEASE` (contracts `version.ts`) and every `package.json`
   version together (a server test checks they agree), and build the image
   with `ANNOTINDER_COMMIT` (`hosting.md`, "Versions"). A breaking change
   to the design schema bumps `DESIGN_FORMAT_VERSION`.
2. Migrations only add: change `server/src/db/schema/` and run
   `db:generate`; never edit a released migration.
3. Run the checks: `pnpm build`, `pnpm typecheck`, `pnpm lint`,
   `pnpm test`, `pnpm test:e2e`, and the load test
   (`server/scripts/load-test.mjs`, results in `hosting.md` "Capacity")
   against the release build.
4. A security read of what changed: authorization and study scoping of
   every new route and id, CSRF (`x-annotinder`), cookies, redirect URLs,
   markdown and `::html` rendering, body sizes (`security.md`).
