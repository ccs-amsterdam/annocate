# Hosting

AnnoTinder is one Node server that also serves the built client (one origin,
so session cookies work), plus a Postgres database. The `Dockerfile` builds
the server and the client into one image. `compose.yml` runs that image with
Postgres and a service that dumps the database every day.

The first part of this file is a step-by-step guide for a pilot server on
the lab's infrastructure. The rest is reference: settings, the login
provider, the database schema, versions and capacity.

## Pilot server, step by step

This guide goes from an empty Ubuntu 24.04 VM to AnnoTinder on HTTPS, with
researchers logging in through the lab's Keycloak. It follows the lab's
conventions (societal-analytics-lab-infra: *Installation: university VMs*,
*Apps on our servers*, *Docker Compose standards*):

- Caddy on the VM does HTTPS.
- The app lives in `/opt/annotinder`, owned by the system account `sal`.
- Docker runs with `sudo`.
- Ports are open on `127.0.0.1` only.

There is no lab login (authwall) in front of the app: AnnoTinder has its own
login.

In the commands below, replace `annotinder.example.org` with the server's
hostname.

**What you need before you start:**

| What | For |
| --- | --- |
| The hostname, and someone who can add a DNS record for it | Step 1 |
| An admin account on the VM, with `sudo` | Every step |
| Admin access to the `idp` realm of the lab's Keycloak, or a lab admin who creates the client | Step 4 |
| The email addresses of the first admins, each with an account in `idp`, a verified address and a second factor | Steps 5 and 9 |

### 1. DNS

Add an `A` record for `annotinder.example.org` that points to the VM's IP
address (also an `AAAA` record if the VM has IPv6). Check it from your own
machine:

```bash
dig +short annotinder.example.org
```

Caddy can only get a certificate once this answers with the VM's address,
and ports 80 and 443 are open (step 2).

### 2. The VM: firewall, Docker, Caddy and `sal`

Set up the VM as described in *Installation: university VMs* in the lab's
infrastructure docs. The lab's `setup-vm.sh` script does it in one go:

- your admin user;
- SSH with keys only;
- the firewall, with `--web` for ports 80 and 443;
- automatic security updates;
- Docker with the compose plugin;
- Caddy, with `--caddy`;
- the system account `sal`.

```bash
bash setup-vm.sh <your username> --web --caddy --ssh-from <VU range 1>,<VU range 2>
```

By hand, the same steps are:

- **Docker:** install Docker Engine with the compose plugin from Docker's own
  apt repository (the official instructions for Ubuntu).
- **Caddy:** install it from its own apt repository, not Ubuntu's `caddy`
  package, which is too old.
- **The system account and its admins:**

  ```bash
  sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin sal
  ```

  ```bash
  sudo usermod -aG sal <your username>
  ```

  Log out and back in for the group membership to apply. Nobody joins the
  `docker` group, `sal` included: that group is effectively root access.

Check the result:

```bash
sudo docker compose version && caddy version && id sal
```

`caddy version` must say 2.9 or newer.

### 3. The app folder

Create the folder, owned by `sal`. Admins (the `sal` group) can enter it and
read its files. Other users can't enter it at all.

```bash
sudo mkdir /opt/annotinder
```

```bash
sudo chown sal:sal /opt/annotinder
```

```bash
sudo chmod 750 /opt/annotinder
```

Clone the code into it, as `sal`. The repository itself is the app's folder:

- `compose.yml` is at the top;
- `.env` and `backups/` sit next to it, and git ignores both.

```bash
sudo -u sal git clone https://github.com/ccs-amsterdam/annocate.git /opt/annotinder
```

Until the server work is merged into the default branch, add
`--branch claude/annotinder-server-architecture-psxrk6`. If the repository
is private, clone it with a read-only deploy key, or copy a checkout in and
then run `sudo chown -R sal:sal /opt/annotinder`.

The rules for working in the folder:

- Run commands as `sal` (`sudo -u sal git ...`).
- Run Docker with `sudo` (`sudo docker compose ...`), from `/opt/annotinder`.
- Edit files with `sudoedit -u sal <file>`, which opens your own editor and
  saves as `sal`. Never use plain `sudo` for other commands in the folder,
  or files end up owned by root.

### 4. The login client in Keycloak

AnnoTinder servers of the lab log in with the `idp` realm, where anyone can
create an account and each server decides who gets access. (The `lab` realm
is for lab members and the lab's own tools.) In the admin console of `idp`:

1. **Clients → Create client.**
   - **Client ID:** the host with dashes, e.g. `annotinder-example-org`.
   - **Name:** what users see on the consent screen, e.g. "AnnoTinder
     (annotinder.example.org)".

   Then **Next**.
2. Turn **Client authentication** on (a confidential client). Under
   **Authentication flow**, keep only **Standard flow**. **Next.**
3. Fill in the URIs, then **Save**:
   - **Valid redirect URIs:** `https://annotinder.example.org/api/auth/callback`,
     exactly: `https://`, no trailing slash, no wildcard.
   - **Valid post logout redirect URIs:** `+` (the same as the redirect
     URIs). AnnoTinder logs out locally and doesn't use this, but Keycloak
     refuses an empty field.
4. On the **Credentials** tab, copy the **Client secret** for step 5.

The realm's client policy turns on consent and PKCE (S256) by itself, and
refuses unsafe redirect URIs. AnnoTinder always sends PKCE S256 and asks for
the scopes `openid email`.

Check on the client's **Client scopes** tab that these are **Default**:

- `email`: the address, and `email_verified`;
- `amr`: the second factor;
- `basic`: `sub` and `auth_time`.

New clients in `idp` get these by themselves. Without `email_verified: true`,
AnnoTinder refuses the login. Without `amr`, nobody gets researcher access.

How the realm signals the second factor:

- The `amr` scope's **Authentication Method Reference (AMR)** mapper puts
  `amr` in the ID token.
- Each authenticator in the login flows has a reference value: `pwd` for the
  password, `mfa` for the second factor (an authenticator app, a passkey or
  security key after the password, or a recovery code).
- So after a login with a second factor, the ID token holds `"amr": ["pwd",
  "mfa"]`, and AnnoTinder's setting is `OIDC_MFA_CLAIM=amr:mfa` (the
  default).

On another Keycloak, or for an isolated realm, set up the same things:

- a confidential client with standard flow;
- **PKCE method** S256 (the client's **Advanced** tab);
- the `email` scope;
- an AMR mapper, with reference values on the authenticators.

### 5. Settings

Create `.env` from the example, readable only by `sal`, and fill it in:

```bash
cd /opt/annotinder && sudo -u sal cp .env.example .env && sudo -u sal chmod 600 .env
```

```bash
sudoedit -u sal /opt/annotinder/.env
```

Generate the two secrets with `openssl rand -hex 32` (run it twice). Hex
needs no quoting or escaping.

| Setting | Value for the pilot | Why |
| --- | --- | --- |
| `ANNOTINDER_PUBLIC_URL` | `https://annotinder.example.org` | Where browsers reach the server, with no trailing slash. The login callback is built from it, so it must match the redirect URI of step 4 exactly. With `https://`, the server also sends HSTS. |
| `ANNOTINDER_SECRET` | `openssl rand -hex 32` | Signs login state (between the redirect to Keycloak and the callback) and preview links. Without it, a random one is made at every start: logins in progress and previews break at each restart. |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | The database password. `compose.yml` builds `DATABASE_URL` from it, so use letters and digits only. Postgres keeps the password it was created with, so set it before the first start. |
| `OIDC_HOST` | `https://auth.societal-analytics.nl/realms/idp` | The issuer. The server reads `<OIDC_HOST>/.well-known/openid-configuration` at the first login, so the VM must be able to reach it. |
| `OIDC_CLIENT_ID` | e.g. `annotinder-example-org` | The client ID from step 4. |
| `OIDC_CLIENT_SECRET` | from step 4 | The client secret from step 4. |
| `OIDC_ACCOUNT_URL` | `https://auth.societal-analytics.nl/realms/idp/account` | The provider's account page, where users set up a second factor themselves; AnnoTinder links to it. Required (the server doesn't start without it), unless `AUTH_INSECURE_DISABLE_2FA`. For Keycloak: `<OIDC_HOST>/account`. |
| `ANNOTINDER_ADMINS` | e.g. `a.researcher@vu.nl,b.researcher@vu.nl` | The server's first admins: these addresses get the admin role at login, with a verified address. Further admins can be made in the app. |
| `OIDC_MFA_CLAIM` | leave out (default `amr:mfa`) | Which ID token claim counts as a second factor (step 4). For SURFconext it would be `acr:<level>`. |
| `AUTH_STEP_UP_MAX_AGE` | leave out (default `600`) | Sensitive actions (API keys, admin changes) need a second factor from the last 10 minutes. After that, AnnoTinder sends the user to Keycloak again (`max_age`) for a fresh one. |

`compose.yml` sets the rest:

- `DATABASE_URL`, from `POSTGRES_PASSWORD`;
- `ANNOTINDER_TRUST_PROXY=1`: the app is reachable only through Caddy on the
  same machine, so it takes the client address for rate limits from
  `X-Forwarded-For`.

The image sets `PORT` and `ANNOTINDER_CLIENT_DIR`. The commit comes in as a
build argument (step 6). Never set `AUTH_DEV_MODE` or `ANNOTINDER_DEMO` on a
server. The full list is under [Settings](#settings).

### 6. Build and start

```bash
cd /opt/annotinder && sudo ANNOTINDER_COMMIT=$(sudo -u sal git rev-parse --short HEAD) docker compose up -d --build
```

`ANNOTINDER_COMMIT` is the commit the image is built from. Each deployment
records it, so a study says exactly which version coders saw. The first
build takes a few minutes. Then check:

- `sudo docker compose ps`: `app` is `healthy`, `db` is `healthy`, and
  `db-backup` is up.
- `sudo docker compose logs app` shows `researcher login:
  https://auth.societal-analytics.nl/realms/idp (second factor: amr:mfa),
  callback https://annotinder.example.org/api/auth/callback`, and the
  admins.
- `sudo docker ps --format '{{.Names}}\t{{.Ports}}'` shows only
  `127.0.0.1:8787->8787/tcp`, with no `0.0.0.0:` or `[::]:`.
- `curl -s localhost:8787/api/health` prints the release and the commit.

The server creates the database schema at its first start.

### 7. Caddy

Add the site to `/etc/caddy/Caddyfile`:

```bash
sudoedit /etc/caddy/Caddyfile
```

```
annotinder.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

```bash
sudo systemctl reload caddy
```

Caddy gets a Let's Encrypt certificate by itself. It forwards with the
original `Host`, and sets `X-Forwarded-For` and `X-Forwarded-Proto`. There
is no body size limit, so large unit uploads (up to 256 MB) pass, and no
timeout that cuts off exports. If the certificate doesn't come, run
`journalctl -u caddy -n 50`: usually DNS doesn't point to the VM yet, or
ports 80 and 443 are closed.

### 8. Smoke test

From your own machine, or on the VM:

```bash
/opt/annotinder/scripts/smoke-test.sh https://annotinder.example.org
```

It needs only bash and curl, and exits with 1 if any check fails. It checks:

- `/api/health`, and prints the release and commit;
- the app (`/`), with its Content-Security-Policy, and HSTS over HTTPS;
- `/api/auth/options`: login configured, and not in development mode;
- that `/api/auth/login` redirects to Keycloak. It prints the client, the
  scope, PKCE and the redirect URI, which proves the server can reach
  Keycloak;
- that `/api/me` refuses a request without a login;
- the coder home page (`/code`);
- that unknown `/api` paths answer a JSON 404.

With an API key (step 9) it also checks `GET /api/me`. Pass the key in
`ANNOTINDER_API_KEY` to keep it out of the shell history:

```bash
ANNOTINDER_API_KEY=atk_... /opt/annotinder/scripts/smoke-test.sh https://annotinder.example.org
```

The output of a working pilot looks like this:

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

1. **A second factor first.** Second factors are optional in `idp`;
   AnnoTinder needs one for server admin access and sensitive actions
   (researchers can work without one). If the admin has none yet, they set
   up an authenticator app in Keycloak's account console:
   `https://auth.societal-analytics.nl/realms/idp/account`, then **Account
   security → Signing in**.
2. **Log in.** Open `https://annotinder.example.org/research` and click
   **Log in**. Log in at Keycloak with the password and the second factor,
   and accept the consent screen (once per server).
3. **Check the admin role.** An address in `ANNOTINDER_ADMINS` gets the
   admin role. The user menu says "Admin", and the study list shows a
   **Server admin** button (`/research/admin`). If not, see
   [Login troubleshooting](#login-troubleshooting).
4. **An API key for the smoke test.** User menu → **API keys** → create one,
   and run step 8 with it. This is a sensitive action: a second factor from
   more than 10 minutes ago means one more login.
5. **One full study, to check the whole flow:**
   1. **Create new study** → **Start from an example**.
   2. **Deploy** it.
   3. Open its link in a private window and code a few units.
   4. Check that the answers show up in the study's results.
   5. Archive the study afterwards (its **Settings** tab).

### 10. Backups

The data is the Postgres database. The `db-backup` service in `compose.yml`
dumps it into `/opt/annotinder/backups/annotinder-<date>.dump`:

- once at its start, and every day at 02:00 (UTC);
- the dumps of the last 7 days are kept;
- the dumps are readable by root only.

The VM's nightly backup of `/opt` takes in `backups/` and `.env` (*Backups*
in the lab's infrastructure docs; set that up after this guide). The named
volume with the database's own files is not backed up: the dumps are the
backup.

- **Check it:** `sudo docker compose logs db-backup` says `dump written`, and
  `sudo ls -l backups/` lists the dump. The first dump is made at the very
  first start, before there is much in the database.
- **A dump now** (e.g. before an update): `sudo docker compose restart
  db-backup`. It replaces today's dump.
- **A restore test**, once when setting up and after big changes. It loads
  the newest dump into a scratch database next to the real one, counts the
  studies, and removes the scratch database. The app keeps running.

  ```bash
  cd /opt/annotinder && dump=$(sudo ls backups | grep '^annotinder-' | sort | tail -n 1) && echo "$dump"
  ```

  ```bash
  sudo docker compose exec -T db createdb -U annotinder restore_test
  ```

  ```bash
  sudo cat "backups/$dump" | sudo docker compose exec -T db pg_restore -U annotinder -d restore_test --no-owner
  ```

  ```bash
  sudo docker compose exec -T db psql -U annotinder -d restore_test -c "select count(*) as studies from studies"
  ```

  ```bash
  sudo docker compose exec -T db dropdb -U annotinder restore_test
  ```

- **Restoring for real** replaces the database with a dump:

  ```bash
  sudo docker compose stop app db-backup
  ```

  ```bash
  sudo docker compose exec -T db dropdb -U annotinder annotinder && sudo docker compose exec -T db createdb -U annotinder annotinder
  ```

  ```bash
  sudo cat backups/<dump> | sudo docker compose exec -T db pg_restore -U annotinder -d annotinder --no-owner
  ```

  ```bash
  sudo docker compose up -d
  ```

  Older dumps come from the nightly backup (`--include
  /opt/annotinder/backups`).

Never run `docker compose down -v` or `docker volume prune`: they delete the
database volume.

### 11. Updating

```bash
cd /opt/annotinder && sudo docker compose restart db-backup
```

```bash
sudo -u sal git pull
```

```bash
sudo ANNOTINDER_COMMIT=$(sudo -u sal git rev-parse --short HEAD) docker compose up -d --build
```

The first command makes a fresh dump. The server applies new migrations
when it starts. Run the smoke test afterwards: it prints the new commit.
Old images pile up, so clear them now and then with
`sudo docker image prune`.

Postgres is pinned to a version in `compose.yml`. A minor update (18.x) is
a change of the tag. A major update (18 to 19) needs a dump, a new volume
and a restore.

### 12. Logs

- **The server:** `sudo docker compose logs -f app`, or
  `--since 1h` for the last hour. This shows startup (settings, login,
  admins), failed logins (`Login failed: ...`) and errors.
- **The database and its dumps:** `sudo docker compose logs db db-backup`.
- **Caddy** (certificates, proxy errors): `journalctl -u caddy -n 100`.
- **How much is kept:** Docker keeps each service's log in files that it
  never trims by itself, so `compose.yml` caps them at 3 files of 10 MB per
  service (`x-logging`); older lines are dropped. Rebuilding or recreating a
  container also starts a new log.

After changing `.env`, apply it with `sudo docker compose up -d`, which
recreates the app with the new settings. Check the startup lines in the
log.

### Login troubleshooting

| What you see | Likely cause |
| --- | --- |
| Keycloak: "Invalid parameter: redirect_uri" | The client's **Valid redirect URIs** is not exactly `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`. Check `https`, the hostname and the trailing slash. The smoke test prints the redirect URI the server sends. |
| **Log in** gives `{"error":"Internal error"}`, and the log has `performDiscovery` or `fetch failed` | The server can't reach `OIDC_HOST`. Check the spelling (`.../realms/idp`, no trailing `/.well-known`), DNS, and outbound HTTPS from the VM: `curl -s https://auth.societal-analytics.nl/realms/idp/.well-known/openid-configuration`. |
| "Login is not configured on this server" | `OIDC_HOST`, `OIDC_CLIENT_ID` or `OIDC_CLIENT_SECRET` is empty in `.env`, or the app wasn't recreated after the change. |
| Back at AnnoTinder with "Logging in didn't work", and the log has `Login failed: invalid_client` (or `unauthorized_client`) | A wrong client secret or client ID. Copy the secret again from the **Credentials** tab. |
| "Logging in didn't work", with no error in the log | The login took too long, or the server restarted during it without `ANNOTINDER_SECRET`. Try again, and set the secret. |
| "Your login provider did not confirm your email address" | `email_verified` is not `true`: the user hasn't verified the address in Keycloak, or the client lacks the `email` scope (step 4). |
| No admin role, and the user menu shows an orange shield ("Add a second factor") | The ID token's `amr` has no `mfa`, so admin access is off for this login. Either the user has no second factor in `idp` (set it up in the account console, step 9), or they set one up during this login: that login holds only `pwd`, so log out and in again. Else the client lacks the `amr` scope, or `OIDC_MFA_CLAIM` isn't `amr:mfa`. |
| "That login didn't confirm it's you" after a sensitive action | The step-up login came back without a second factor from the last `AUTH_STEP_UP_MAX_AGE` seconds. Log in again with the second factor. Also check that the VM's clock is right (`timedatectl`). |
| Logged in, but no admin role | The address isn't in `ANNOTINDER_ADMINS` (the log's startup line lists the admins), or it isn't verified. The role is given at login: log out and in again after changing `.env` and recreating the app. |
| "Logging in didn't work" every time, or the login doesn't stick | The site was opened at another address than `ANNOTINDER_PUBLIC_URL` (e.g. `http://`, or the IP address). Keycloak sends the browser back to the public address, where the cookie from the start of the login doesn't exist. Use the public address. |
| `429` on login | The login rate limit (60 per minute per address). Wait a minute. |

## With Docker Compose elsewhere

Outside the lab, the same `compose.yml` works on any machine with Docker:

1. Copy `.env.example` to `.env` and fill it in ([Settings](#settings)).
2. Register AnnoTinder with your login provider ([Login provider](#login-provider)).
3. Run `ANNOTINDER_COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build`.

The app then listens on `127.0.0.1:8787`. Put a proxy in front of it that
does TLS and forwards to it, keeping the `Host` header and setting
`X-Forwarded-Proto` and `X-Forwarded-For`. Caddy does all of that with the
two-line site block of step 7.

## Settings

| Variable | What |
| --- | --- |
| `ANNOTINDER_PUBLIC_URL` | Where browsers reach AnnoTinder, e.g. `https://annotinder.example.org` (no trailing slash). The login callback is `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`. With `https://`, the server sends HSTS |
| `ANNOTINDER_SECRET` | Signs login state and preview links. A long random string (`openssl rand -hex 32`); without it, these end at every restart |
| `DATABASE_URL` | Postgres, e.g. `postgres://user:pass@host:5432/annotinder`. The compose file sets it from `POSTGRES_PASSWORD`. Without it, the server uses PGlite in `PGLITE_DIR` (development) |
| `OIDC_HOST`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | The researcher login ([Login provider](#login-provider)): the provider's issuer, and the client ID and secret. Without them, nobody can log in |
| `OIDC_MFA_CLAIM` | Which ID token claim counts as a second factor: `amr:mfa` (default) or `acr:<value>`. See `security.md` §1 |
| `OIDC_PREVIOUS_HOST`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_MFA_CLAIM`, `OIDC_PREVIOUS_UNTIL` | While moving to another login provider: the previous one, accepted until `OIDC_PREVIOUS_UNTIL` (a date), so users can link their new login. See `accounts.md`, "Changing providers" |
| `OIDC_ACCOUNT_URL` | The provider's account page, where users set up a second factor; required unless `AUTH_INSECURE_DISABLE_2FA`. See `security.md` §1 |
| `AUTH_STEP_UP_MAX_AGE` | How many seconds a login's second factor stays fresh for sensitive actions (default 600). See `security.md` §1 |
| `AUTH_INSECURE_DISABLE_2FA`, `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` | `true`: weaker security for teaching and other servers without sensitive data ("Login provider" below; `security.md` §1) |
| `ANNOTINDER_ADMINS` | Comma-separated email addresses that get the admin role when they log in: the server's first admins (`accounts.md`) |
| `ANNOTINDER_TRUST_PROXY` | `1`: behind a proxy (Caddy, nginx) that sets `X-Forwarded-For`, so rate limits count the client's address from it. Only when the server can't be reached except through the proxy. The compose file sets it |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits, e.g. for a load test from one machine. On by default (`security.md`) |
| `ANNOTINDER_FRAME_ANCESTORS` | Origins (space or comma separated) that may show AnnoTinder in a frame besides itself, e.g. AmCAT's `https://amcat.example.org` |
| `ANNOTINDER_COMMIT` | The commit, recorded with each deployment ([Versions](#versions)). A build argument of the image |
| `POSTGRES_PASSWORD` | Compose only: the database password |
| `PORT` | Default 8787 |
| `HOST` | Where to listen. Default all addresses (in development mode: localhost) |
| `PGPOOL_MAX` | Database connections per server process (default 20) |
| `PGLITE_DIR` | Without `DATABASE_URL`: where the PGlite database lives (development; default `.pglite` in `packages/server`) |
| `ANNOTINDER_CLIENT_DIR` | The built client. The image sets it |
| `ANNOTINDER_DEMO` | `1`: an empty database gets the demo study. Development only |
| `AUTH_DEV_MODE` | `1`: development auth headers instead of a login. The server refuses to start unless it listens on localhost only. **Never for a server other people use** |

An empty value counts as unset.

**Command-line tools** run in the app container, with the server's database
settings:

- `sudo docker compose exec app node dist/keys.js create --email <address> --label <label>`
  creates an API key for a user (`keys.js list`, `keys.js revoke` too).
- `sudo docker compose exec app node dist/identities.js reset --yes`
  forgets all login identities, after changing providers (`accounts.md`).

## Login provider

Researchers, and coders whose link asks for it, log in with an OpenID
Connect provider: the lab's Keycloak (step 4 above), another Keycloak,
Authentik, Zitadel, or SURFconext.

- Register a confidential web client with the redirect URI
  `<ANNOTINDER_PUBLIC_URL>/api/auth/callback` and PKCE (S256). The server
  asks for the scopes `openid email`. It logs out locally, without a
  redirect to the provider.
- The provider must meet the lab's Authentication standard (`security.md`
  §1):
  - verified email addresses (`email_verified: true`);
  - a second factor that it signals in the ID token (`OIDC_MFA_CLAIM`);
  - step-up (`max_age`, `auth_time`).

  - an account page where users set up a second factor themselves
    (`OIDC_ACCOUNT_URL`). OpenID Connect has no standard way to find it,
    so it is a setting.

  Server admin access and sensitive actions need the second factor;
  researchers can work without one, and are shown where to set it up.
- **A provider without these, for teaching or a low-sensitivity server**
  (e.g. a free Auth0 tenant, which has no usable 2FA signal): turn the
  missing requirement off with `AUTH_INSECURE_DISABLE_2FA=true` or
  `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION=true` (`security.md` §1, "Weaker
  security"). Never on a server with sensitive research data: for that, use
  the institution's provider or the lab's Keycloak, as in the steps above.
  Step-up (`max_age`, `auth_time`) can't be turned off.
- Users are their login at the provider (`iss` + `sub`), not their email
  address. There are two ways to move to another provider
  (`accounts.md`, "Changing providers"):
  - keep the old one for a while (`OIDC_PREVIOUS_*`), so users link their
    new login;
  - or have users re-claim their account by email (`identities.js reset`,
    above).

Security settings (second factor, headers, rate limits, framing):
`security.md`.

## The database schema

The server creates and updates the schema when it starts. It applies the
migrations in `packages/server/migrations` that the database doesn't have
yet (they are recorded in its `drizzle` schema). They run in order and
under a lock, so several server processes can start at once. A database
from an earlier release is updated in place.

**Changing the schema** (development): edit the tables in
`packages/server/src/db/schema/`, then run:

```
pnpm --filter @annotinder/server db:generate
```

It writes a new migration (SQL, plus its snapshot in `migrations/meta/`)
from the difference with the last one. Read it, and commit it with the
change; the next server start applies it. An applied migration is never
edited. `packages/server/README.md` has the details.

Migrations also upgrade **study exports** (below): an import applies them
to a database that holds that one study. So a migration must work on any
subset of studies: no data it inserts that rows depend on, nothing that
assumes other studies or users are there. A new table that holds a study's
data goes into `EXPORTED` or `NOT_EXPORTED` in
`server/src/shared/studyExport.ts` (a test fails otherwise).

## Moving a study

A study's **Settings › Export study** downloads the whole study as one file
(`<study>_<date>.annotinder.gz`): units, design versions, deployments,
links, coders, their devices and answers. **Create new study › From a
file** on this or another server imports it as a new study, with or
without its coders and answers. Exporting is for the study's ADMINs, and a
sensitive action (a recent login with a second factor): the file holds
coders' data, such as coder ids and the emails of coders who logged
in.

- **Format** (contracts `StudyExportManifestSchema`): gzipped JSON lines, a
  manifest, then each row as the database holds it (`to_jsonb`). The
  manifest names the release and the database's last migration.
- **Importing** (`server/src/shared/studyExport.ts`) loads the rows into an
  empty in-memory database at that migration, applies the newer migrations,
  and copies the result into this database in one transaction. An export
  from an older release therefore opens on a newer one; one from a newer
  release is refused, and so is one from a database whose migrations this
  release doesn't know.
- **What changes**: every row gets a new id (from the tables' own
  sequences) and references are renumbered. The importer owns the study
  (and is its ADMIN); links get new secrets (send coders the new links);
  coders' browsers can't continue (their device keys are new), but a coder
  who logged in finds their session by logging in. Codings are derived from
  the answers again.
- **What stays behind**: the study's other users and their roles, leases,
  transfer links. Session ids in results downloaded before the move differ
  from those after it; match coders by their coder id (`coder`).
- The importer's limits apply (studies, units, coders).

## Versions

Each deployment records the release and commit it ran on, in the deploy
history and in `design.json` in the results export, so a study says
exactly what coders saw. The release is in the code. The commit comes from
`ANNOTINDER_COMMIT`, which the image takes as a build argument (steps 6 and
11). Without it, the commit is recorded as "unknown", and the smoke test
says so. A server run from a git checkout finds the commit itself.
`GET /api/health` answers `{ ok: true, service, release, commit }`; the
image's health check uses it.

## Several server processes

The server keeps only each live study's deployment (design, sets,
settings) in memory, so several processes can share one database
(`architecture.md` §3), e.g. compose replicas behind a proxy. Two things
stay per process:

- researcher previews live in one process's memory;
- a study's limit on answers is counted per process.

A pilot runs one process.

## Capacity

`packages/server/scripts/load-test.mjs` simulates coders on one study. The
setup:

- a 4-core machine, with Postgres 17 in Docker;
- one server process;
- a study of 10,000 units in a shared queue (until 2 coders, at most 2);
- batches of 5 units.

| Coders | Time per unit | Next batch p50 / p99 | Submit p50 / p99 |
| --- | --- | --- | --- |
| 300 | ~10 s (realistic) | 26 / 79 ms | 10 / 31 ms |
| 300 | ~1 s (stress) | 8.9 s / 16.8 s | 32 / 87 ms |

No unit was coded by more than its `maxCoders`.

A shared queue hands out units one pick at a time: it holds a lock while it
decides, and each pick reads the queue's codings. That gives about 25 picks
per second at 10k units and ~12k codings, and fewer as codings grow
(`architecture.md` §11, item 11). That is far more than coders at a
realistic pace need: 300 coders at 10 s per unit, in batches of 5, make 6
picks per second. Studies without a shared queue don't take that lock.
