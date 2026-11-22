# Hosting

AnnoTinder is one Node server that also serves the built client (one origin,
so session cookies work), plus a Postgres database. The `Dockerfile` builds
both into one image; `compose.yml` runs it with Postgres and a daily database
dump.

The first part is a step-by-step guide for a pilot server on the lab's
infrastructure. The rest is reference: [another machine](#with-docker-compose-elsewhere),
[settings](#settings), [login provider](#login-provider),
[database schema](#the-database-schema), [moving a study](#moving-a-study),
[versions](#versions), [capacity](#capacity).

## Pilot server, step by step

From an empty Ubuntu 24.04 VM to AnnoTinder on HTTPS, with researchers
logging in through the lab's Keycloak. It follows the lab's conventions
(societal-analytics-lab-infra: *Installation: university VMs*, *Apps on our
servers*, *Docker Compose standards*): Caddy on the VM does HTTPS; the app
lives in `/opt/annotinder`, owned by the system account `sal`; Docker runs
with `sudo`; ports are open on `127.0.0.1` only. There is no lab authwall in
front: AnnoTinder has its own login.

Replace `annotinder.example.org` with the server's hostname.

**Before you start:**

| What | For |
| --- | --- |
| The hostname, and someone who can add a DNS record | Step 1 |
| An admin account on the VM, with `sudo` | Every step |
| Admin access to the `idp` realm of the lab's Keycloak (or a lab admin who creates the client) | Step 4 |
| The email addresses of the first admins, each with an `idp` account, a verified address and a second factor | Steps 5 and 9 |

### 1. DNS

Add an `A` record (and `AAAA` with IPv6) for `annotinder.example.org`
pointing to the VM. Check with `dig +short annotinder.example.org`. Caddy
gets a certificate only once this answers with the VM's address and ports 80
and 443 are open.

### 2. The VM: firewall, Docker, Caddy and `sal`

The lab's `setup-vm.sh` (*Installation: university VMs*) sets up your admin
user, key-only SSH, the firewall (`--web`: ports 80 and 443), automatic
security updates, Docker with the compose plugin, Caddy (`--caddy`) and the
system account `sal`:

```bash
bash setup-vm.sh <your username> --web --caddy --ssh-from <VU range 1>,<VU range 2>
```

By hand: install Docker Engine with the compose plugin and Caddy, each from
its own apt repository (Ubuntu's `caddy` is too old), then:

```bash
sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin sal
sudo usermod -aG sal <your username>     # log out and in again afterwards
```

Nobody joins the `docker` group, `sal` included: that is root access.

Check: `sudo docker compose version && caddy version && id sal` (Caddy 2.9 or
newer).

### 3. The app folder

```bash
sudo mkdir /opt/annotinder && sudo chown sal:sal /opt/annotinder && sudo chmod 750 /opt/annotinder
sudo -u sal git clone https://github.com/ccs-amsterdam/annocate.git /opt/annotinder
```

The repository is the app's folder: `compose.yml` at the top, `.env` and
`backups/` next to it (git ignores both). Until the server work is merged into
the default branch, add `--branch claude/annotinder-server-architecture-psxrk6`
to the clone. For a private repository use a read-only deploy key, or copy a
checkout in and `sudo chown -R sal:sal /opt/annotinder`.

Rules for working in the folder:

- Run commands as `sal` (`sudo -u sal git ...`).
- Run Docker with `sudo` from `/opt/annotinder` (`sudo docker compose ...`).
- Edit files with `sudoedit -u sal <file>`. Never plain `sudo` for other
  commands here, or files end up owned by root.

### 4. The login client in Keycloak

Lab servers log in with the `idp` realm (anyone can make an account; each
server decides who gets access). In its admin console:

1. **Clients → Create client.** Client ID: the host with dashes (e.g.
   `annotinder-example-org`); Name: what users see on the consent screen
   (e.g. "AnnoTinder (annotinder.example.org)"). **Next**.
2. Turn **Client authentication** on; under **Authentication flow** keep only
   **Standard flow**. **Next**.
3. **Valid redirect URIs:** exactly `https://annotinder.example.org/api/auth/callback`
   (no trailing slash, no wildcard). **Valid post logout redirect URIs:** `+`
   (unused, but Keycloak refuses an empty field). **Save**.
4. Copy the **Client secret** from the **Credentials** tab for step 5.

The realm's client policy turns on consent and PKCE (S256); AnnoTinder always
sends PKCE S256 and asks for `openid email`. On the **Client scopes** tab,
check that `email` (address and `email_verified`), `amr` (the second factor)
and `basic` (`sub`, `auth_time`) are **Default**; new `idp` clients have them.
Without `email_verified: true` the login is refused; without `amr` nobody gets
admin access.

The realm signals the second factor through the `amr` scope's AMR mapper:
authenticators have reference values (`pwd` for the password, `mfa` for a
second factor), so after a login with one the ID token has
`"amr": ["pwd", "mfa"]`, matching AnnoTinder's default `OIDC_MFA_CLAIM=amr:mfa`.
On another Keycloak, set up the same: a confidential client with standard
flow, PKCE S256 (**Advanced** tab), the `email` scope, an AMR mapper with
reference values.

### 5. Settings

```bash
cd /opt/annotinder && sudo -u sal cp .env.example .env && sudo -u sal chmod 600 .env
sudoedit -u sal /opt/annotinder/.env
```

Generate the two secrets with `openssl rand -hex 32` (hex needs no quoting).

| Setting | Pilot value | Why |
| --- | --- | --- |
| `ANNOTINDER_PUBLIC_URL` | `https://annotinder.example.org` | Where browsers reach the server, no trailing slash. Must match the redirect URI of step 4. `https://` turns on HSTS |
| `ANNOTINDER_SECRET` | `openssl rand -hex 32` | Signs login state and preview links. Without it, a random one per start breaks logins in progress and previews at each restart |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | Letters and digits only (`compose.yml` builds `DATABASE_URL` from it). Set before the first start: Postgres keeps the first password |
| `OIDC_HOST` | `https://auth.societal-analytics.nl/realms/idp` | The issuer; the VM must reach it |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | from step 4 | |
| `OIDC_ACCOUNT_URL` | `https://auth.societal-analytics.nl/realms/idp/account` | Where users set up a second factor (`<OIDC_HOST>/account` for Keycloak). Required unless `AUTH_INSECURE_DISABLE_2FA` |
| `ANNOTINDER_ADMINS` | e.g. `a.researcher@vu.nl,b.researcher@vu.nl` | The first admins: these verified addresses get the admin role at login |

`compose.yml` sets `DATABASE_URL` and `ANNOTINDER_TRUST_PROXY=1` (the app is
reachable only through Caddy, so rate limits use `X-Forwarded-For`); the image
sets `PORT` and `ANNOTINDER_CLIENT_DIR`. Never set `AUTH_DEV_MODE` or
`ANNOTINDER_DEMO` on a server. All settings: [Settings](#settings).

### 6. Build and start

```bash
cd /opt/annotinder && sudo ANNOTINDER_COMMIT=$(sudo -u sal git rev-parse --short HEAD) docker compose up -d --build
```

`ANNOTINDER_COMMIT` is recorded with each deployment, so a study says which
version coders saw. The first build takes a few minutes; the server creates
the database schema at its first start. Then check:

- `sudo docker compose ps`: `app` and `db` are `healthy`, `db-backup` is up.
- `sudo docker compose logs app` shows `researcher login: https://auth.societal-analytics.nl/realms/idp (second factor: amr:mfa), callback https://annotinder.example.org/api/auth/callback`
  and the admins.
- `sudo docker ps --format '{{.Names}}\t{{.Ports}}'` shows only
  `127.0.0.1:8787->8787/tcp` (no `0.0.0.0:` or `[::]:`).
- `curl -s localhost:8787/api/health` prints the release and commit.

### 7. Caddy

Add the site with `sudoedit /etc/caddy/Caddyfile`:

```
annotinder.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Caddy gets a Let's Encrypt certificate itself, keeps the `Host` header and
sets `X-Forwarded-For` and `X-Forwarded-Proto`. It has no body size limit (unit
uploads go up to 256 MB) and no timeout that cuts off exports. No certificate?
`journalctl -u caddy -n 50`: usually DNS or closed ports.

### 8. Smoke test

```bash
/opt/annotinder/scripts/smoke-test.sh https://annotinder.example.org
```

Needs only bash and curl; exits with 1 if a check fails. It checks
`/api/health`, the app with its CSP (and HSTS over HTTPS), that login is
configured and not in development mode, that `/api/auth/login` redirects to
Keycloak (printing client, scope, PKCE and redirect URI), that `/api/me`
refuses anonymous requests, the coder home, and JSON 404s for unknown `/api`
paths. With an API key (step 9) it also checks `GET /api/me`; pass the key in
`ANNOTINDER_API_KEY` to keep it out of the shell history:

```bash
ANNOTINDER_API_KEY=atk_... /opt/annotinder/scripts/smoke-test.sh https://annotinder.example.org
```

A working pilot:

```
AnnoTinder smoke test: https://annotinder.example.org
  ok    GET /api/health: release 0.1.0, commit 1a2b3c4
  ok    GET /: the app
  ok    security headers (Content-Security-Policy)
  ok    HTTPS, with Strict-Transport-Security
  ok    GET /api/auth/options: login configured
  ok    GET /api/auth/login: to https://auth.societal-analytics.nl/realms/idp/protocol/openid-connect/auth
        client annotinder-example-org, scope "openid email", PKCE S256, redirect URI https://annotinder.example.org/api/auth/callback
  ok    GET /api/me without a login: 401
  ok    GET /code: the coder home page
  ok    GET /api/<unknown>: 404 as JSON
All checks passed.
```

### 9. First admin login

1. **A second factor first.** Optional in `idp`, but AnnoTinder needs it for
   admin access and sensitive actions. Set up an authenticator app at
   `https://auth.societal-analytics.nl/realms/idp/account` → **Account
   security → Signing in**.
2. **Log in** at `https://annotinder.example.org/research` with password and
   second factor; accept the consent screen (once per server).
3. **Check the admin role**: the user menu says "Admin" and the study list has
   a **Server admin** button. If not: [Login troubleshooting](#login-troubleshooting).
4. **An API key** (user menu → **API keys**) for the smoke test (step 8). A
   sensitive action: a second factor older than 10 minutes means one more
   login.
5. **One full study**: **Create new study** → **Start from an example**,
   **Deploy**, open its link in a private window and code a few units, check
   the results, then archive the study (**Settings**).

### 10. Backups

The `db-backup` service dumps the database into
`/opt/annotinder/backups/annotinder-<date>.dump` at its start and daily at
02:00 UTC, keeps 7 days, readable by root only. The VM's nightly backup of
`/opt` (*Backups* in the lab's docs; set it up after this guide) takes
`backups/` and `.env`. The database volume itself is not backed up: the dumps
are the backup.

- **Check**: `sudo docker compose logs db-backup` says `dump written`;
  `sudo ls -l backups/` lists it.
- **A dump now** (e.g. before an update): `sudo docker compose restart db-backup`.
- **Restore test** (once at setup, and after big changes): loads the newest
  dump into a scratch database, counts studies, drops it. The app keeps running.

  ```bash
  cd /opt/annotinder && dump=$(sudo ls backups | grep '^annotinder-' | sort | tail -n 1) && echo "$dump"
  sudo docker compose exec -T db createdb -U annotinder restore_test
  sudo cat "backups/$dump" | sudo docker compose exec -T db pg_restore -U annotinder -d restore_test --no-owner
  sudo docker compose exec -T db psql -U annotinder -d restore_test -c "select count(*) as studies from studies"
  sudo docker compose exec -T db dropdb -U annotinder restore_test
  ```

- **Restore for real** (replaces the database):

  ```bash
  sudo docker compose stop app db-backup
  sudo docker compose exec -T db dropdb -U annotinder annotinder && sudo docker compose exec -T db createdb -U annotinder annotinder
  sudo cat backups/<dump> | sudo docker compose exec -T db pg_restore -U annotinder -d annotinder --no-owner
  sudo docker compose up -d
  ```

  Older dumps come from the nightly backup.

Never run `docker compose down -v` or `docker volume prune`: they delete the
database volume.

### 11. Updating

```bash
cd /opt/annotinder && sudo docker compose restart db-backup     # a fresh dump
sudo -u sal git pull
sudo ANNOTINDER_COMMIT=$(sudo -u sal git rev-parse --short HEAD) docker compose up -d --build
```

The server applies new migrations at start. Run the smoke test afterwards (it
prints the new commit). Clear old images now and then with
`sudo docker image prune`. Postgres is pinned in `compose.yml`: a minor update
(18.x) is a tag change; a major one (18 to 19) needs a dump, a new volume and
a restore.

### 12. Logs

- **Server**: `sudo docker compose logs -f app` (or `--since 1h`): startup
  (settings, login, admins), failed logins (`Login failed: ...`), errors.
- **Database and dumps**: `sudo docker compose logs db db-backup`.
- **Caddy**: `journalctl -u caddy -n 100`.
- Docker never trims logs itself, so `compose.yml` caps each service at 3
  files of 10 MB.

After changing `.env`, apply it with `sudo docker compose up -d` and check the
startup lines.

### Login troubleshooting

| What you see | Likely cause |
| --- | --- |
| Keycloak: "Invalid parameter: redirect_uri" | **Valid redirect URIs** isn't exactly `<ANNOTINDER_PUBLIC_URL>/api/auth/callback` (check `https`, hostname, trailing slash). The smoke test prints what the server sends. |
| **Log in** gives `{"error":"Internal error"}`; the log has `performDiscovery` or `fetch failed` | The server can't reach `OIDC_HOST`: check spelling (`.../realms/idp`), DNS, outbound HTTPS (`curl -s https://auth.societal-analytics.nl/realms/idp/.well-known/openid-configuration`). |
| "Login is not configured on this server" | An `OIDC_HOST`, `OIDC_CLIENT_ID` or `OIDC_CLIENT_SECRET` is empty, or the app wasn't recreated after the change. |
| "Logging in didn't work"; the log has `Login failed: invalid_client` (or `unauthorized_client`) | Wrong client secret or ID. Copy the secret again. |
| "Logging in didn't work", nothing in the log | The login took too long, or the server restarted during it without `ANNOTINDER_SECRET`. |
| "Logging in didn't work" every time | The site was opened at another address than `ANNOTINDER_PUBLIC_URL` (`http://`, the IP address): the login's cookie is on the other address. |
| "Your login provider did not confirm your email address" | `email_verified` isn't `true`: the user hasn't verified it, or the client lacks the `email` scope. |
| No admin role, orange shield ("Add a second factor") | The ID token's `amr` has no `mfa`: no second factor in `idp`, or it was set up during this login (log out and in again). Else the client lacks the `amr` scope, or `OIDC_MFA_CLAIM` isn't `amr:mfa`. |
| No admin role, no shield | The address isn't in `ANNOTINDER_ADMINS` (the startup log lists them) or isn't verified. The role is given at login: log in again after recreating the app. |
| "That login didn't confirm it's you" after a sensitive action | The step-up login had no second factor from the last `AUTH_STEP_UP_MAX_AGE` seconds. Also check the VM's clock (`timedatectl`). |
| `429` on login | The login rate limit (60 per minute per address). Wait a minute. |

## With Docker Compose elsewhere

The same `compose.yml` works on any machine with Docker:

1. Copy `.env.example` to `.env` and fill it in ([Settings](#settings)).
2. Register AnnoTinder with your login provider ([Login provider](#login-provider)).
3. `ANNOTINDER_COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build`.

The app listens on `127.0.0.1:8787`. Put a TLS proxy in front that keeps the
`Host` header and sets `X-Forwarded-Proto` and `X-Forwarded-For` (Caddy's
two-line block from step 7 does).

## Settings

Environment variables; an empty value counts as unset. `.env.example` lists
those for `compose.yml`.

| Variable | What |
| --- | --- |
| `ANNOTINDER_PUBLIC_URL` | Where browsers reach AnnoTinder, no trailing slash. The login callback is `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`; `https://` turns on HSTS |
| `ANNOTINDER_SECRET` | Signs login state and preview links (`openssl rand -hex 32`); without it these end at every restart |
| `DATABASE_URL` | Postgres, e.g. `postgres://user:pass@host:5432/annotinder` (compose sets it). Without it: PGlite in `PGLITE_DIR` (development) |
| `OIDC_HOST`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | The login provider's issuer and client. Without them nobody can log in |
| `OIDC_MFA_CLAIM` | Which ID token claim is a second factor: `amr:mfa` (default) or `acr:<value>` (`security.md` §1) |
| `OIDC_ACCOUNT_URL` | The provider's account page for setting up a second factor; required unless `AUTH_INSECURE_DISABLE_2FA` |
| `OIDC_PREVIOUS_HOST`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_MFA_CLAIM`, `OIDC_PREVIOUS_UNTIL` | The previous provider while changing providers, until a date (`accounts.md`, "Changing providers") |
| `AUTH_STEP_UP_MAX_AGE` | Seconds a second factor stays fresh for sensitive actions (default 600) |
| `AUTH_INSECURE_DISABLE_2FA`, `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` | `true`: weaker security, for teaching and servers without sensitive data (`security.md` §1) |
| `ANNOTINDER_ADMINS` | Comma-separated addresses that get the admin role at login |
| `ANNOTINDER_TRUST_PROXY` | `1`: take the client address from `X-Forwarded-For`. Only when the server is reachable only through the proxy (compose sets it) |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (e.g. a load test from one machine) |
| `ANNOTINDER_FRAME_ANCESTORS` | Origins (space or comma separated) that may frame AnnoTinder, e.g. `https://amcat.example.org` |
| `ANNOTINDER_COMMIT` | The commit recorded with each deployment; a build argument of the image |
| `POSTGRES_PASSWORD` | Compose only: the database password |
| `PORT` | Default 8787 |
| `HOST` | Where to listen. Default all addresses (development mode: localhost) |
| `PGPOOL_MAX` | Database connections per server process (default 20) |
| `PGLITE_DIR` | Without `DATABASE_URL`: the PGlite folder (default `packages/server/.pglite`) |
| `ANNOTINDER_CLIENT_DIR` | The built client (the image sets it) |
| `ANNOTINDER_DEMO` | `1`: an empty database gets the demo study. Development only |
| `AUTH_DEV_MODE` | `1`: development auth headers instead of a login; the server only starts if it listens on localhost. **Never on a server others use** |

**Command-line tools**, run in the app container with the server's database
settings:

- `sudo docker compose exec app node dist/keys.js create --email <address> --label <label>`:
  an API key for a user (also `list`, `revoke`).
- `sudo docker compose exec app node dist/identities.js reset --yes`: forget
  all login identities after changing providers (`accounts.md`).

## Login provider

Researchers, and coders whose link asks for it, log in with an OpenID Connect
provider: the lab's Keycloak (step 4), another Keycloak, Authentik, Zitadel or
SURFconext.

- Register a confidential web client with redirect URI
  `<ANNOTINDER_PUBLIC_URL>/api/auth/callback` and PKCE S256. The server asks
  for `openid email` and logs out locally only.
- The provider must give verified email addresses (`email_verified: true`),
  a second factor signalled in the ID token (`OIDC_MFA_CLAIM`), step-up
  (`max_age`, `auth_time`), and an account page where users set up a second
  factor (`OIDC_ACCOUNT_URL`; OpenID Connect has no standard way to find it).
  Details: `security.md` §1.
- **For teaching or a low-sensitivity server** with a provider lacking these
  (e.g. a free Auth0 tenant): `AUTH_INSECURE_DISABLE_2FA=true` or
  `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION=true`. Never with sensitive
  research data. Step-up can't be turned off.
- Users are their login at the provider (`iss` + `sub`), not their address.
  To change providers, keep the old one for a while (`OIDC_PREVIOUS_*`) so
  users link their new login, or let users re-claim accounts by email
  (`identities.js reset`): `accounts.md`, "Changing providers".

## The database schema

The server applies the migrations in `packages/server/migrations` it doesn't
have yet at start (recorded in the `drizzle` schema), in order and under a
lock, so several processes can start at once.

**Changing the schema** (development): edit `packages/server/src/db/schema/`,
then `pnpm --filter @annotinder/server db:generate` writes a new migration.
Read it and commit it with the change; never edit an applied migration
(`packages/server/README.md`).

Migrations also upgrade **study exports** (below), on a database holding only
that study. So a migration must work on any subset of studies: insert no data
rows depend on, assume no other studies or users. A new table with study data
goes into `EXPORTED` or `NOT_EXPORTED` in `server/src/shared/studyExport.ts` (a
test fails otherwise).

## Moving a study

**Settings › Export study** downloads the whole study as one file
(`<study>_<date>.annotinder.gz`): units, design versions, deployments, links,
coders, devices and answers. **Create new study › From a file** imports it, on
this or another server, as a new study, with or without coders and answers.
Exporting is for the study's ADMINs and is a sensitive action: the file holds
coders' data.

- **Format** (`StudyExportManifestSchema`): gzipped JSON lines, a manifest
  (release, last migration), then each row as stored.
- **Import** loads the rows into an empty in-memory database at that
  migration, applies newer migrations, and copies the result in one
  transaction. Exports from older releases open on newer ones; from a newer
  release (or unknown migrations) they are refused.
- **What changes**: every row gets a new id; the importer owns the study;
  links get new secrets (send coders the new links); coders' browsers can't
  continue, but a coder who logged in finds their session by logging in.
  Codings are derived again.
- **What stays behind**: other users and their roles, leases, transfer links.
  Session ids differ from before the move: match coders by coder id.
- The importer's limits apply.

## Versions

Each deployment records the release and commit it ran on (the deploy history,
and `design.json` in the results). The release is in the code; the commit
comes from `ANNOTINDER_COMMIT` (a build argument; "unknown" without it, which
the smoke test reports). A server run from a git checkout finds the commit
itself. `GET /api/health` answers `{ ok: true, service, release, commit }`.

## Several server processes

Only each live study's deployment is kept in memory, so several processes can
share one database (`architecture.md` §3). Per process: researcher previews,
and the count for a study's answer limit. A pilot runs one process.

## Capacity

`packages/server/scripts/load-test.mjs` simulates coders on one study. Setup:
a 4-core machine, Postgres 16, one server process, 10,000 units shared by a
crowd (two coders per unit), batches of 5.

| Coders | Time per unit | Next batch p50 / p99 | Submit p50 / p99 |
| --- | --- | --- | --- |
| 300 | ~10 s (realistic) | 25 / 85 ms | 12 / 38 ms |
| 300 | ~1 s (stress) | 0.6 / 1.1 s | 0.6 / 1.2 s |

Requests waiting for a shared queue's lock are picked together, one read for
all (`architecture.md` §11, item 11). Under stress the one server process is
busy (about 160 submitted units per second); 300 coders at 10 s per unit need
30. When the queue runs out, a unit gets at most one coder more than its
maximum (coders past others' leases); units leased by coders who left come
back when the lease expires (15 minutes). Studies without a shared queue don't take that lock.
