# Release checklist

What to do before the pilot server and before a release: what is ready,
what is open, and the checks for every release. **Decide** marks a choice for
the maintainer.

## 1. Pilot server

The step-by-step guide is `hosting.md`, "Pilot server, step by step": from
an empty Ubuntu 24.04 VM to AnnoTinder on HTTPS, with the lab's Keycloak.

Ready:

- [x] The guide follows the lab's conventions: Caddy on the VM, the app in
  `/opt/annotinder` owned by `sal`, `sudo docker compose`, ports on
  `127.0.0.1` only.
- [x] `compose.yml` has the app, Postgres 18 and a `db-backup` service with
  daily dumps in `backups/`, as in the lab's Docker Compose standards. Tested
  locally with the built image: the containers become healthy, the dumps are
  written, and both the restore test of the guide and a full restore work.
- [x] `.env.example` lists every setting, grouped into required and
  optional, with comments.
- [x] `scripts/smoke-test.sh <url> [api key]` checks a running server
  (`hosting.md`, step 8).
- [x] The e2e tests pass against real Postgres (16), not only PGlite.

To do on the server (the guide's steps):

1. **The hostname and DNS**, the VM (`setup-vm.sh --web --caddy`), and the
   app folder (steps 1 to 3).
2. **The Keycloak client** in the `idp` realm, with the redirect URI
   `https://<host>/api/auth/callback` (step 4).
3. **Settings** (step 5): `ANNOTINDER_PUBLIC_URL`, `ANNOTINDER_SECRET`,
   `POSTGRES_PASSWORD`, the `OIDC_*` settings and `ANNOTINDER_ADMINS`. Never
   `AUTH_DEV_MODE` or `ANNOTINDER_DEMO`. Run one server process (previews
   and answer limits are per process, `architecture.md` §11).
4. **The first build on the server** (step 6). The image has been built
   here, but not yet on the VM.
5. **Login with the real provider** (step 9). The automated tests use a mock
   provider only. Check:
   - a researcher without a second factor (the orange shield, its link to
     `OIDC_ACCOUNT_URL`) and an admin with one (`OIDC_MFA_CLAIM`);
   - a step-up for a sensitive action (an API key);
   - logging out;
   - a coder signing in on a link whose invitation requires sign-in.
6. **The smoke test with an API key**, and one full study (steps 8 and 9).
7. **Backups:** add the VM to the nightly backup of `/opt`, and run the
   restore test once (step 10).
8. **Email coders, by hand.** Use a design whose coder column holds email
   addresses, with one link and sign-in required. Each coder gets the units
   of their own address; any other address gets 403 `email_not_allowed`.
   The e2e tests don't cover this.
9. **Move a study.** The tests export and import on PGlite and on
   Postgres 16 (`TEST_DATABASE_URL`). On the pilot server (Postgres 18),
   export a study with answers from Settings and import it (`hosting.md`
   "Moving a study"); compare the two downloads.
10. **Read `security.md`** before inviting anyone outside the team.

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
2. **Texts**: the README, the welcome page and the "About AnnoTinder"
   help topic from `philosophy.md` (pending the maintainer).

## 3. Open work

- **R and Python clients** follow the researcher API's names: `study`
  (not job), `links`, `design` (design versions), everything under
  `/api`, experiments (`POST /experiment/:name`, `assignCondition`, in
  the coder API).
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
  versioning (the packages are all `0.1.0`).

Known limitations, documented rather than fixed:

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
3. Run the checks: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
   `pnpm test`, `pnpm test:e2e`, and the load test
   (`server/scripts/load-test.mjs`, results in `hosting.md` "Capacity")
   against the release build. Run `pnpm test:e2e` once with `DATABASE_URL`
   set to an empty Postgres database too, not only on PGlite.
4. After updating a server (`hosting.md`, step 11): run
   `scripts/smoke-test.sh` against it.
5. A security read of what changed: authorization and study scoping of
   every new route and id, CSRF (`x-annotinder`), cookies, redirect URLs,
   markdown and `::html` rendering, body sizes (`security.md`).
