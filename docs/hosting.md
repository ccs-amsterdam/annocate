# Hosting

How to run an AnnoTinder server with Docker Compose: the published image,
the settings, the login provider, HTTPS in front, updates, backups and
monitoring, and what to expect from it under load. Drafts of the legal texts
a public server needs are in [`legal/`](legal/README.md).

AnnoTinder is one Node server that also serves the built client (one origin,
so session cookies work), plus a Postgres database. Nothing else: no Redis,
no queue, no mail server. Everything such a store is usually for is in
Postgres (sessions, rate limit counters, locks) or in the process's memory
(a small cache), and a second store would be a second thing to run, back up
and secure for no gain at this size ([Capacity](#capacity)).

`compose.yml` runs the app (the published image, built and checked by CI for
each release), Postgres and a daily database dump.

**Contents**

- [What you need](#what-you-need)
- [Setting up](#setting-up): files, login provider, settings, start, HTTPS
  proxy, smoke test, first admin
- [Updating](#updating), and going back
- [Backups](#backups) and the restore test
- [Monitoring](#monitoring) and logs
- [Staying up](#staying-up)
- [Behind the Cloudflare proxy](#behind-the-cloudflare-proxy)
- [Security-relevant settings](#security-relevant-settings)
- Reference: [settings](#settings), [login provider](#login-provider),
  [moving a study](#moving-a-study), [the database schema](#the-database-schema),
  [versions](#versions), [capacity](#capacity)

**What was tested, and what was not.** The compose file, the image, the
daily dumps, the in-place restore test and the smoke test were run (locally,
with the built image). Marked **(untested)**: everything written from
documentation and not run for this guide: the restic commands, the proxy
configuration for Cloudflare, every Cloudflare setting, hourly dumps, and a
database outside the compose file. Try each on a test machine before you
rely on it. Cloudflare's limits come from its documentation of November
2026; check them on its pages.

## What you need

- **A server or VM** with Docker and Docker Compose, a public hostname
  (e.g. `annotinder.example.org`) pointing to it, and a reverse proxy that
  does HTTPS, such as Caddy. We recommend hosting AnnoTinder on your own
  server or VM; set it up as your organisation does for any server (an
  organisation can keep its own server standard alongside this guide).
- **An OpenID Connect provider** for researcher login ([Login
  provider](#login-provider)): your institution's, or another one that meets
  the requirements.
- **The email addresses of the first admins** (two people, not one), each
  with an account at the provider, a verified address and a second factor.
- **Size**: 2 cores, 4 GB memory and 40 GB disk are plenty for a pilot (5
  studies, 50 coders at once); 4 cores, 8 GB and 80 GB for 50 studies and 500
  coders at once ([Capacity](#capacity)).
- **A password manager entry** for the server: its secrets go there too.

## Setting up

Replace `annotinder.example.org` with your hostname and `/opt/annotinder`
with your app folder. Run Docker commands with `sudo` if your user isn't
allowed to use Docker.

### 1. The files

A server needs two files from the same release: `compose.yml` and
`.env.example` (which becomes `.env`). No checkout of the code and no build:
the app is the published image `ghcr.io/ccs-amsterdam/annotinder`, and the
backup script is part of `compose.yml`. `.env` and `backups/` (made at the
first start) come next to them.

```bash
mkdir -p /opt/annotinder && cd /opt/annotinder
curl -fsSL -O https://raw.githubusercontent.com/ccs-amsterdam/annotinder/v0.9.0/compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/ccs-amsterdam/annotinder/v0.9.0/.env.example
```

Take both from the release you run (the tag in the address, e.g. `v0.9.0`),
so they match its image. Keep the folder readable by admins only, since
`.env` holds the secrets. Docker Compose 2.23 or newer is needed (for the
files `compose.yml` holds); amd64 and arm64 both work.

### 2. Register AnnoTinder at the login provider

Register a **confidential web client** (OpenID Connect, authorization code
flow with PKCE S256) with the redirect URI

```
https://annotinder.example.org/api/auth/callback
```

exactly: no trailing slash, no wildcard, and the post-logout redirect URI
(Keycloak: **Valid post logout redirect URIs**)

```
https://annotinder.example.org/
```

with its trailing slash. AnnoTinder asks for the scopes `openid email`.
Copy the client ID and secret.
What the provider must send is in [Login provider](#login-provider): a
verified email address, a second factor signalled in the ID token, and
`auth_time` for step-up.

### 3. Settings and secrets

```bash
cp .env.example .env && chmod 600 .env
```

Edit `.env`. Generate the secrets with `openssl rand -hex 32` (hex needs no
quoting).

| Setting | Value | Why |
| --- | --- | --- |
| `ANNOTINDER_VERSION` | e.g. `0.9.0` | The release to run: `compose.yml` pulls `ghcr.io/ccs-amsterdam/annotinder:0.9.0` |
| `ANNOTINDER_PUBLIC_URL` | `https://annotinder.example.org` | Where browsers reach the server: no path, no trailing slash. Must match the redirect URI above. `https://` turns on HSTS. **Required** |
| `ANNOTINDER_SECRET` | `openssl rand -hex 32` | Signs login state, preview links and download links. **Required**, at least 32 characters |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | Letters and digits only (`compose.yml` builds `DATABASE_URL` from it). Set before the first start: Postgres keeps the first password |
| `OIDC_HOST` | the provider's issuer URL | The server must reach it |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | from step 2 | |
| `OIDC_ACCOUNT_URL` | the provider's account page | Where users set up a second factor (Keycloak: `<OIDC_HOST>/account`). Required unless `AUTH_INSECURE_DISABLE_2FA` |
| `ANNOTINDER_ADMINS` | `a@example.org,b@example.org` | The first admins: these verified addresses get the admin role at login |

Also fill in what the server's "About this server" page (`/about`) tells
coders and researchers: `ANNOTINDER_OPERATOR` (who runs the server),
`ANNOTINDER_HOSTING` (where it is hosted, for every part: the VM, the
database, the backups, a proxy in front), `ANNOTINDER_CONTACT`,
`ANNOTINDER_PRIVACY_URL` and `ANNOTINDER_TERMS_URL`. They are optional, but
a line you leave out reads "Not stated". AnnoTinder and these docs say
nothing about where any server is hosted: each server says so itself.

`compose.yml` sets `DATABASE_URL` and `ANNOTINDER_TRUST_PROXY` (default
`proxy`); the image sets `PORT` and `ANNOTINDER_CLIENT_DIR`. Never set
`AUTH_DEV_MODE` or `ANNOTINDER_DEMO` on a server. All settings:
[Settings](#settings).

**The secrets.** `.env` holds three: `ANNOTINDER_SECRET`, `POSTGRES_PASSWORD`
and `OIDC_CLIENT_SECRET`. Keep a copy of all three in the password manager:
a restored server needs the same `.env`.

- **Losing or changing `ANNOTINDER_SECRET`** is not a disaster: logins in
  progress, preview links and download links stop working. Sessions of
  researchers and coders are in the database and go on.
- **Changing `POSTGRES_PASSWORD`** in `.env` alone breaks the app: Postgres
  keeps the password it was created with. Change it in the database first
  (`ALTER USER annotinder PASSWORD '...'`), then in `.env`.
- Without `ANNOTINDER_SECRET` or `ANNOTINDER_PUBLIC_URL` the server does not
  start with `DATABASE_URL` set: `docker compose logs app` shows the setting
  to change, and the container restarts until it is there.

### 4. Start

```bash
docker compose pull && docker compose up -d
```

The first command downloads the images, the second starts them. The server
creates the database schema at its first start. The release's
commit is inside the image and is recorded with each deployment, so a study
says which version coders saw. Then check:

- `docker compose ps`: `app` and `db` are `healthy`, `db-backup` is up.
- `docker compose logs app` shows the researcher login, its callback
  address, the admins and where client addresses come from.
- `docker ps --format '{{.Names}}\t{{.Ports}}'` shows only
  `127.0.0.1:8787->8787/tcp` (no `0.0.0.0:` or `[::]:`): keep the port on
  `127.0.0.1`, since a published Docker port bypasses most firewalls.
- `curl -s localhost:8787/api/health` prints the release and commit.

To run a change that isn't released yet: [Building the image
yourself](#building-the-image-yourself), or a test server with a branch's or
commit's image ([Versions](#versions)).

### 5. The HTTPS proxy

The app listens on `127.0.0.1:8787` and does no HTTPS itself. Put a reverse
proxy in front. With Caddy, which gets its own certificates:

```
annotinder.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

What AnnoTinder needs from any proxy:

- **`X-Forwarded-For`**, written by the proxy, with the connecting address
  last: the rate limits use it (`ANNOTINDER_TRUST_PROXY=proxy`, which
  `compose.yml` sets). The app must be reachable **only** through the proxy,
  or anyone could send the header themselves.
- **`X-Forwarded-Proto: https`**: the session cookies are marked `Secure`
  only when the request came over https.
- **The `Host` header** as sent by the browser.
- **No body size limit below 256 MB** (units uploads and study imports) and
  no timeout that cuts off exports. Caddy has neither; nginx needs
  `client_max_body_size 256m` and longer `proxy_read_timeout`.
- **No access log with query strings**: coder links carry their secret in
  `?link=...`, next to panel ids. Caddy writes no access log unless you ask
  for one.

Caddy sets the first three by itself; other proxies need them spelled out.

#### Caddy in Docker

On a server where nothing else uses ports 80 and 443, `compose.yml` can run
Caddy too, so no proxy is installed on the host: the optional `caddy`
service. Turn it on in `.env` and start as usual:

```bash
COMPOSE_PROFILES=caddy
```

It serves `ANNOTINDER_PUBLIC_URL` (the `caddyfile` in `compose.yml`), gets a
Let's Encrypt certificate for that host by itself, and forwards to
`127.0.0.1:8787`. Before the first start, DNS for the host must point to the
server, and ports 80 and 443 (TCP, and 443/UDP for HTTP/3) must be open with
nothing else listening on them. Caddy runs in the host's network
(`network_mode: host`), so the app sees each visitor's own address (also over
IPv6) and the firewall applies to it as to any program. Keep the
`caddy-data` volume: without it Let's Encrypt may refuse new certificates for
a while. Its log: `docker compose logs caddy`.

### 6. Smoke test

```bash
scripts/smoke-test.sh https://annotinder.example.org
```

The script is in the code (`scripts/smoke-test.sh`): run it from any machine
with a checkout, or download it.

Needs only bash and curl; exits with 1 if a check fails. It checks
`/api/health`, the app with its security headers (and HSTS over HTTPS), that
login is configured and not in development mode, that `/api/auth/login`
redirects to the provider (printing client, scope, PKCE and redirect URI),
that `/api/me` refuses anonymous requests, the coder home, and JSON 404s for
unknown `/api` paths. With an API key (step 7) it also checks `GET /api/me`;
pass the key in `ANNOTINDER_API_KEY` to keep it out of the shell history:

```bash
ANNOTINDER_API_KEY=atk_... scripts/smoke-test.sh https://annotinder.example.org
```

### 7. The first admin, and registration

The first admins are the addresses in `ANNOTINDER_ADMINS`. Name two people:
when one is away or loses a second factor, the other can still manage the
server. An address there gets the admin role each time it logs in with a
verified address; the role only works on a login with a second factor
([security](security.md) §1). Admins can make others admin in *Server admin
› Users*.

1. **Set up a second factor** at the provider's account page first.
2. **Log in** at `https://annotinder.example.org/research` and accept the
   consent screen if the provider shows one.
3. **Check the admin role**: the user menu says "Admin" and the study list
   has a **Server admin** button. If not: [Login troubleshooting](#login-troubleshooting).
4. **Make an API key** (user menu → **API keys**) and run the smoke test with
   it. A sensitive action: a second factor older than 10 minutes means one
   more login.
5. **One full study**: **Create new study** → **Start from an example**,
   **Deploy**, open its link in a private window, code a few units, check the
   results, then archive the study (**Settings**).

Before anyone else gets in, decide **who may create studies**: *Server admin
› Registration*. For an invite-only server: "anyone who logs in" off, no
email domains, and decide whether people may send a request. Invite
researchers by address in *Server admin › Users*. **AnnoTinder sends no
email**: tell them yourself. An invitation is good for 3 months. The default
plan (*Plans*) starts at 20 studies, 50,000 units per study, 200,000 units in
total, 5,000 coders and 2,000,000 answers per study, and crowd sign-in off:
lower it for accounts you don't know ([accounts](accounts.md) §3).

### Login troubleshooting

| What you see | Likely cause |
| --- | --- |
| The provider: "Invalid parameter: redirect_uri" | The registered redirect URI isn't exactly `<ANNOTINDER_PUBLIC_URL>/api/auth/callback` (check `https`, hostname, trailing slash). The smoke test prints what the server sends. |
| **Log in** gives `{"error":"Internal error"}`; the log has `performDiscovery` or `fetch failed` | The server can't reach `OIDC_HOST`: check spelling, DNS, outbound HTTPS (`curl -s <OIDC_HOST>/.well-known/openid-configuration`). |
| "Login is not configured on this server" | An `OIDC_HOST`, `OIDC_CLIENT_ID` or `OIDC_CLIENT_SECRET` is empty, or the app wasn't recreated after the change. |
| "Logging in didn't work"; the log has `Login failed: invalid_client` (or `unauthorized_client`) | Wrong client secret or ID. |
| "Logging in didn't work" every time | The site was opened at another address than `ANNOTINDER_PUBLIC_URL` (`http://`, the IP address): the login's cookie is on the other address. |
| "Your login provider did not confirm your email address" | `email_verified` isn't `true`: the user hasn't verified it, or the client lacks the `email` scope. |
| No admin role, orange shield ("Add a second factor") | The ID token has no second-factor signal (`OIDC_MFA_CLAIM`, default `amr` containing `mfa`): no second factor at the provider, or it was set up during this login (log out and in again), or the provider doesn't send the claim. |
| No admin role, no shield | The address isn't in `ANNOTINDER_ADMINS` (the startup log lists them) or isn't verified. The role is given at login: log in again after recreating the app. |
| "That login didn't confirm it's you" after a sensitive action | The step-up login had no second factor from the last `AUTH_STEP_UP_MAX_AGE` seconds. Also check the server's clock. |

## Updating

```bash
cd /opt/annotinder
docker compose restart db-backup                     # a fresh dump first
sed -i 's/^ANNOTINDER_VERSION=.*/ANNOTINDER_VERSION=0.9.1/' .env
docker compose pull && docker compose up -d
```

Read the release's entry in `CHANGELOG.md` first: a new minor version
(0.10.0) can change what scripts or researchers see. When it says
`compose.yml` or `.env.example` changed, download the new `compose.yml`
(step 1) and add new settings to `.env`. Then run the smoke test
(it prints the new commit). The server is away for some seconds while its
container is replaced: update at a quiet hour.

- **A server installed before 0.9.0 can't be updated.** Until 0.9.0 the
  first migration was regenerated in place when the schema changed, and the
  server skips a migration it has already applied without noticing that the
  file changed: such a database no longer fits the code. Start again with an
  empty database, after researchers have taken their downloads. Study export
  files from before 0.9.0 are not supported either.
- **From 0.9.0 on, migrations only add.** The server applies new ones at
  start; an update never needs a reset, and exports from older releases open
  on newer ones. Released migrations are frozen (a test fails when one is
  edited).
- **Going back** to an older release: the same steps with the old number
  (and its `compose.yml`, if that changed).
  If the update changed the database, restore the dump made before it first
  ([Backups](#restoring)), since an older server may not fit a newer schema.
  Answers given in between are lost, so decide fast.
- **Clear old images** now and then with `docker image prune`.
- **Postgres** is pinned in `compose.yml`: a minor update (18.x) is a tag
  change; a major one (18 to 19) needs a dump, a new volume and a restore.
- **The operating system** and Docker are yours to update. The app's base
  image is refreshed with each release.

## Backups

Everything that matters is in the database: studies, units, answers,
accounts, sessions. Besides it, a server is its `.env` (and your proxy's
configuration). Results downloads (`ANNOTINDER_FILES_DIR`, inside the
container by default) are a cache and need no backup. That folder is the
server's file store: once units can hold files of their own (images, audio),
those are data, and the folder (or the object store that replaces it) must be
backed up with the database.

Three layers, each against a different accident:

| Layer | Protects against | Does not protect against |
| --- | --- | --- |
| 1. **Dumps on the server** (the `db-backup` service) | A bad update, a deleted study, a damaged database | Losing the server or its disk |
| 2. **Snapshots of the VM** (the provider's or your IT's) | Losing the VM; a broken system update | A problem at the provider; whoever can delete the VM can delete its snapshots |
| 3. **Encrypted copies elsewhere** | Losing the server, the account or the provider; a break-in that wipes the server | Nothing, if the restore was tested and the key is not only on the server |

### Layer 1: dumps

The `db-backup` service dumps the database into
`backups/annotinder-<date>.dump` at its start and daily at 02:00 UTC, and
keeps 7 days (`BACKUP_TIME`, `KEEP_DAYS` in `compose.yml`). The files are
readable by root only and **not encrypted**. The database volume itself is
not backed up: the dumps are the backup.

- **Check**: `docker compose logs db-backup` says `dump written`; a failed
  dump logs `ERROR: pg_dump failed`.
- **A dump now** (e.g. before an update): `docker compose restart db-backup`.
  It replaces today's file.
- Never run `docker compose down -v` or `docker volume prune`: they delete
  the database volume.
- **Hourly dumps**, for studies whose data you can't collect again: a line in
  root's crontab **(untested)**. It keeps 24 files, each overwritten a day
  later; a dump reads the whole database, which is fine up to some GB.

```
7 * * * * cd /opt/annotinder && f=backups/hourly-$(date -u +\%H).dump && docker compose exec -T db pg_dump -U annotinder --format=custom annotinder > $f.partial && mv $f.partial $f
```

### Layers 2 and 3

**Snapshots:** ask your IT or turn on at the hosting provider: daily
snapshots of the whole VM, how long they are kept, how to get one back.
Postgres recovers from a snapshot taken while it runs like from a power cut.
It brings back the whole machine in minutes, but lives where the VM lives.

**Copies elsewhere:** copy `backups/`, `.env` and your proxy's configuration
to another provider or site, encrypted before they leave the machine.
[restic](https://restic.net) to any S3 store does that, keeps old versions
and stores unchanged data once. Dumps of a pilot are megabytes, of a busy
server a few GB: tens of GB at most with the retention below. **(untested)**
Make a bucket and an access key that reaches only that bucket, then as root
write `/root/restic.env` (`RESTIC_REPOSITORY=s3:https://<host>/<bucket>`,
`RESTIC_PASSWORD_FILE=/root/restic.password`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, mode 600), make the password with
`openssl rand -hex 32`, run `restic init`, and run nightly after the dump
(root's crontab, `30 2 * * *`):

```bash
#!/bin/sh
# /usr/local/bin/annotinder-offsite: copies the dumps and settings off the machine (docs/hosting.md, "Backups").
set -eu
. /root/restic.env
restic backup --tag annotinder /opt/annotinder/backups /opt/annotinder/.env
restic forget --tag annotinder --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
# Tell the backup check that this ran (Monitoring): only reached when both commands worked
curl -fsS -m 10 --retry 3 "<the check's ping address>" > /dev/null
```

**Cloudflare R2 as the store** (S3-compatible; you pay for storage only, the
first 10 GB free; not run for this guide). Create the bucket with
**jurisdiction EU** (chosen at creation, it keeps the data in the EU), make an
R2 API token with *Object Read & Write* on that bucket only, and use its key
pair as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` with
`RESTIC_REPOSITORY=s3:https://<account-id>.eu.r2.cloudflarestorage.com/<bucket>`
(the address the bucket's settings show). restic encrypts before uploading,
so R2 only ever holds data it can't read; R2 encrypts at rest as well. A
bucket lock rule (retention) keeps a break-in from deleting the copies; make
it at least as long as the oldest copy you keep, or `restic forget` can't
remove expired copies until it ends.

- **Put the restic password and the access key in the password manager
  now.** Without the password the copies are noise; the server must not be
  the only place that has it. Run `restic check` once a month.
- **How far back the copies go is a privacy decision** as well as a safety
  one: data a researcher deleted stays in the copies until they expire
  ([privacy statement](legal/privacy-statement.md) §7). The numbers above
  keep a year; choose them on purpose and put them in your privacy statement.
- A break-in on the server gets the access key and could delete the copies:
  use object lock, or a key that can add but not delete, when the data can't
  be collected again **(untested)**.
- A dump is compressed, so two days' dumps share little that restic can skip.
  If the copies grow too fast, dump without compression (`DUMP_OPTIONS:
  "--compress=0"` on `db-backup`) and let restic compress **(untested)**.

### The restore test

A backup that was never restored is a hope. Two tests:

**In place, five minutes** (at setup, and after big changes). Loads the
newest dump into a scratch database next to the real one, counts studies,
drops it. The app keeps running. This one was run. (Run as a user that can
read `backups/`: root, so with `sudo`.)

```bash
cd /opt/annotinder && dump=$(ls backups | grep '^annotinder-' | sort | tail -n 1) && echo "$dump"
docker compose exec -T db createdb -U annotinder restore_test
cat "backups/$dump" | docker compose exec -T db pg_restore -U annotinder -d restore_test --no-owner
docker compose exec -T db psql -U annotinder -d restore_test -c "select count(*) as studies from studies"
docker compose exec -T db dropdb -U annotinder restore_test
```

**On another machine, an hour** (before real data comes in, then once or
twice a year): the test of whether you could survive losing the server, and
how long it takes. Use a throwaway VM and only what is outside the server:
this guide, the password manager and the off-site copies **(the restic steps
are untested)**.

1. Docker and your proxy on the new machine; the repository at the same
   release or a newer one, never an older one.
2. Restore the files (`restic restore latest --target /tmp/restore`, with
   `restic.env` and the password from the password manager) and put `.env` in
   the app folder.
3. Start **only the database** and load the dump before the app ever starts
   (the app would create its own empty tables first):
   `docker compose up -d db`, then the `pg_restore` line of "Restoring"
   below with the dump from `/tmp/restore/opt/annotinder/backups`.
4. `docker compose up -d`, then the smoke test against `http://localhost:8787`.
   For a full test, point a test hostname at the machine and log in: with
   another hostname, the login needs that hostname in `ANNOTINDER_PUBLIC_URL`
   and as a redirect URI at the provider.
5. Compare with the real server (the number of studies, the latest answer of
   a study you know), write down the date, who did it and how long it took,
   and delete the VM.

After a real restore under the real hostname, researchers stay logged in and
coders continue where they were, minus what happened after the dump: both
kinds of session are in the database.

#### Restoring

In place (the server is fine, the data is not; this replaces the database):

```bash
docker compose stop app db-backup
docker compose exec -T db dropdb -U annotinder annotinder && docker compose exec -T db createdb -U annotinder annotinder
cat backups/<dump> | docker compose exec -T db pg_restore -U annotinder -d annotinder --no-owner
docker compose up -d
```

### Dumps or continuous archiving?

With dumps you can lose what happened since the last one: a day, or an hour
with hourly dumps. Continuous archiving (pgBackRest, WAL-G, Barman) brings
that down to about a minute and restores to any moment, but needs a day to
set up, its own restore test, and watching that archiving keeps up. **Use
dumps** to start; move when losing an hour of answers is not acceptable (a
paid panel study of thousands of participants), a dump takes more than about
ten minutes, or the database moves to a managed service. Tell researchers
the level: "at worst, the answers of the last hour (or day) are lost"
([terms of use](legal/terms-of-use.md) §8).

## Monitoring

Three checks. Each must reach a person: an email to two people, or a chat
channel that is read.

1. **Is it up?** A check from outside the server's own network, every few
   minutes, on `https://<host>/api/ready`, expecting status 200. Any uptime
   service does this. `/api/health` does not look at the database (it answers
   as long as the process runs; the container's own health check uses it);
   `/api/ready` asks the database too and answers 503 with `"database":false`
   when Postgres is down or doesn't answer within 3 seconds. A check that
   also covers logging in: `GET https://<host>/api/me` with the header
   `authorization: Bearer <api key>`, expecting 200 (make the key for an
   account without roles in any study). Or run the smoke test with a key from
   another machine, daily from cron.
2. **Is the disk filling?** A full disk stops Postgres. Warn at 80%.
3. **Did the backup run?** A "dead man's switch": the backup job calls an
   address when it has finished (the last line of `annotinder-offsite`), and
   the check warns when the call does **not** come for 26 hours (Uptime
   Kuma's push monitor, healthchecks.io). A check that only looks for errors
   misses the job that never started.

A small script for 2 and for the dump itself, hourly from root's crontab
**(untested)**. It calls a second dead man's switch only when all is well:

```bash
#!/bin/sh
# /usr/local/bin/annotinder-check: disk space, the newest dump, the containers (docs/hosting.md, "Monitoring").
set -eu
cd /opt/annotinder
used=$(df --output=pcent . | tail -n 1 | tr -dc '0-9')
[ "$used" -lt 80 ] || { echo "disk at $used%"; exit 1; }
[ -n "$(find backups -name 'annotinder-*.dump' -mmin -1560)" ] || { echo "no recent dump"; exit 1; }
[ -z "$(docker compose ps --format '{{.Name}} {{.Status}}' | grep -v ' Up ' || true)" ] || { echo "a container is down"; exit 1; }
[ -z "$(docker compose ps --format '{{.Name}} {{.Status}}' | grep unhealthy || true)" ] || { echo "a container is unhealthy"; exit 1; }
curl -fsS -m 10 --retry 3 "<this check's ping address>" > /dev/null
```

Once a month, look at the hardening warnings at the top of *Server admin*.
Not built: an error tracker, and metrics.

### Logs

- `docker compose logs -f app` (or `--since 1h`): startup (settings, login,
  admins), failed logins (`Login failed: ...`), errors, and one line per API
  request: method, path, status, duration and a request id, e.g. `GET
  /api/study/3/units 200 12ms 9f2c1a7b04d1`. Never the query string (coder
  links carry their secret there), bodies, headers or addresses.
  `/api/health` is logged only when it fails.
- Every API response has the id in its `X-Request-Id` header, and an
  unexpected error answers `{"error":"Internal error","requestId":"…"}`,
  shown by the researcher pages too. `docker compose logs app | grep <id>`
  finds the error (`Error in request <id>`) and the request's own line. Of a
  failed query the log has its text and the database's message, never its
  parameters.
- `docker compose logs db db-backup` for the database and the dumps. Docker
  never trims logs itself, so `compose.yml` caps each service at 3 files of
  10 MB.

After changing `.env`, apply it with `docker compose up -d` and check the
startup lines.

## Staying up

What can fail, and what it takes to come back, with one server and tested
backups:

| What fails | What it takes |
| --- | --- |
| The app crashes, or the machine reboots | Back by itself in under a minute (`restart: unless-stopped`; Docker starts at boot). Test it once: reboot, then the smoke test |
| An update goes wrong | Restore the dump made before the update: 15 minutes |
| The hardware under the VM fails | Depends on the platform: many restart the VM elsewhere within minutes (**ask your IT or the provider**). If not: a new VM and a restore, 1 to 4 hours |
| The disk or the VM is lost | A new VM and a restore: 1 to 4 hours, minus what happened since the last dump that left the machine |
| The login provider is down | Coders go on (unless their link requires sign-in); researchers who are logged in go on; nobody can log in |
| Someone deletes a study by mistake | Restore the latest dump on a throwaway server, export the study there and import it on the real one ([Moving a study](#moving-a-study)) |
| An attack floods the server | Rate limits ([security](security.md) §3) help against one source; a real flood needs a proxy in front ([Cloudflare](#behind-the-cloudflare-proxy)) |

To make one server as robust as is realistic: all three backup layers and
one timed restore on another machine; the three checks reaching two people;
two people who can log in to the server and know where the secrets are;
updates at quiet hours with a dump first; and a sentence for researchers:
"the server can be away for some hours; plan your data collection so that
this does not ruin it".

**A standby, later.** If the server gets users who can't wait some hours, a
warm standby is the next step: a second machine at another provider or site
with a copy of the database that follows the first one live (Postgres
streaming replication) and the app ready to start. It is switched **by
hand**, on purpose: automatic switching needs a third machine to decide who
is alive, and done wrong both databases accept answers and the data splits.
That cuts the downtime to 15 to 30 minutes and the data lost to seconds, for
a real amount of work (replication, a check that it keeps up, a rehearsed
switch procedure). Not needed to start **(untested)**.

**One app process.** The server was built to run as several processes on one
database, but has never been run that way: run one. Researcher previews are
kept in one process's memory (they break without session affinity at a load
balancer and end at every restart), results downloads are written to its
disk, and a few caches last a minute. Capacity does not need more
([Capacity](#capacity)).

## Behind the Cloudflare proxy

For a server on the open internet, we recommend the Cloudflare proxy (Free
plan) in front. **Why:** visitors connect to Cloudflare, Cloudflare connects
to your server. That absorbs flooding attacks (DDoS), which no setting of
your own does, hides the server's address, and keeps copies of the client's
static files close to visitors. AnnoTinder uses it as a proxy only: no
Workers, no other Cloudflare products. A server for a known group (a pilot, a
class) does not need it.

**The price is privacy.** Cloudflare decrypts everything that passes:
answers, login cookies, uploads. It is a US company, and on the Free plan a
visitor is served by whichever of its data centres is nearest, anywhere in
the world. So with Cloudflare in front, a server is **not** "hosted in the
EU" in the sense that matters for an ethics application, even when the VM
is: your privacy statement and `ANNOTINDER_HOSTING` must name Cloudflare and
what it sees (`legal/README.md`, decision 3). Ask your privacy officer
before moving the domain. If the answer is no: a proxy from another company,
or no proxy and your hosting provider's own protection against floods.

**No cookie banner is needed** for AnnoTinder itself. It sets three
first-party cookies, all needed to do what the user asked (the coder's
device id, the login session, and one that lives for the minutes of a login),
keeps display preferences and unsaved work in local storage, and loads
nothing from other sites. The law asks for consent for tracking and other
non-essential storage, not for this ([privacy statement](legal/privacy-statement.md)
§5, and the reasoning in its reviewer notes). That changes if you add
analytics or outside widgets, or switch on Cloudflare features that set
cookies of their own (`__cf_bm`, `cf_clearance`, a load balancer's session
affinity): each goes into your privacy statement's cookie table, and a banner
may be needed.

All of the steps below are **untested**; the names of Cloudflare's settings
move now and then.

### 1. Domain and DNS

On the Free plan Cloudflare must run the domain's DNS: change the domain's
nameservers at its registrar. Before that, write down every DNS record the
domain has (mail above all: MX, SPF, DKIM, DMARC), and turn DNSSEC off at the
registrar a day or two ahead (on again at Cloudflare afterwards). The
server's `A`/`AAAA` record is **proxied** (orange cloud); mail and
verification records are **DNS only**. Make no unproxied record that points
at the server (an `ssh.` name, for example): it gives away the address the
proxy hides. Cookies, the login redirect and `ANNOTINDER_PUBLIC_URL` belong
to one hostname: let `www` and any second domain redirect to it.

### 2. HTTPS to the server: Full (strict)

*SSL/TLS › Overview*: **Full (strict)**. Never "Flexible": that sends
visitors' data from Cloudflare to the server unencrypted, and breaks the
login (the server sees `http`). The simplest certificate Cloudflare accepts
is a Cloudflare **origin certificate** (*SSL/TLS › Origin Server*; free,
valid up to 15 years, trusted by Cloudflare only), named in the Caddyfile:

```
annotinder.example.org {
	tls /etc/caddy/origin.pem /etc/caddy/origin.key
	reverse_proxy 127.0.0.1:8787
}
```

Put its end date in a calendar, and turn on *Always Use HTTPS*.

### 3. Only Cloudflare may reach the server

Otherwise an attacker who finds the server's address walks around the proxy.
Allow port 443 from Cloudflare's address ranges only
(`https://www.cloudflare.com/ips-v4` and `ips-v6`; they change a few times a
year at most), in the server's firewall and in any firewall of your hosting
in front of it. If the server's address was public before, ask for a new one.

### 4. The visitor's real address

The server limits requests per address ([security](security.md) §3). With
`ANNOTINDER_TRUST_PROXY=proxy` it takes the address from the **last** entry
of `X-Forwarded-For`: who connected to your proxy. Behind Cloudflare that is
a Cloudflare data centre, and all visitors behind one Cloudflare address
would share one limit.

So set `ANNOTINDER_TRUST_PROXY=cloudflare` in `.env` (`compose.yml` passes it
on and uses `proxy` when `.env` doesn't set it), then `docker compose up -d`.
The server then takes the address from `CF-Connecting-IP`, the visitor's
address as Cloudflare saw it, but only for requests that reached your proxy
from one of Cloudflare's addresses (`shared/clientAddress.ts` holds the
list); anyone else who sends the header is counted under their own address.
Your proxy needs no extra line. The startup log says where addresses come
from (`docker compose logs app | grep "client addresses"`).

**Test it** before the server opens. Open the login page in a browser, then:

```bash
docker compose exec db psql -U annotinder -c "select key, count from rate_limits order by minute desc limit 5"
```

The `login:` line must show your own public address, not one from
Cloudflare's ranges. If it shows a Cloudflare address, Cloudflare has added a
range the server doesn't know yet: limits are then shared per Cloudflare
address (tighter, never looser) until the list is updated.

### 5. What Cloudflare caches

By default Cloudflare caches by file extension (scripts, styles, images,
fonts) and does **not** cache pages (HTML) or JSON. That fits:

| Path | The server says | Cloudflare |
| --- | --- | --- |
| `/assets/*` (the client's scripts and styles; their names change with their content) | cache for a year | caches |
| `/`, `/code/...`, `/research/...` (all the same page, `index.html`) | nothing | does not cache |
| `/api/*` | nothing; downloads say `private, no-store` | does not cache |

Make that explicit, so a later change can't undo it: one Cache Rule, "URI
path starts with `/api/`" → **Bypass cache**. And never add a rule that
caches everything: a cached page or API answer would be shown to the wrong
person. A file under `/assets/` that doesn't exist (an old name after an
update, asked for by a tab that was left open) answers 404 without the
one-year cache header, so no cache keeps the app's page under a script's
name, and going back to an older version needs no cache purge.

### 6. Settings to turn off

The app's pages only allow scripts from its own address ([security](security.md)
§2), and its API is called by programs.

| Setting | Why off |
| --- | --- |
| **Rocket Loader** (*Speed*) | Rewrites the page's scripts: the security policy blocks that, and the app does not start |
| **Web Analytics / RUM** (often on by default on new Free zones), Zaraz, anything that "adds a snippet" | Adds a script: blocked by the security policy, and the privacy statement says there are no analytics |
| **Email Address Obfuscation** (*Scrape Shield*) | Rewrites pages that contain addresses; nothing to gain here |
| **Bot Fight Mode** (*Security › Bots*) | Challenges programs: R and Python clients, the smoke test and uptime checks get a challenge page instead of JSON. On the Free plan no rule can exempt them |
| **Under Attack mode** | Only during an attack: every visitor waits at a check, and API clients fail |

Leave on: the default DDoS protection, the free managed WAF rules (but see
8), HTTP/2 and HTTP/3, Brotli.

### 7. Limits of the proxy

| Limit | Cloudflare (Free and Pro) | The server | What it means |
| --- | --- | --- | --- |
| Size of one request | **100 MB** (Business: 200 MB) | 256 MB for a units upload, a study import and a study from a recipe; 4 MB for the rest of the researcher API, 2 MB for coders, 1 MB for admin, 64 KB for everything else (`shared/bodyLimit.ts`) | An upload or study import between 100 and 256 MB works without Cloudflare and fails behind it (413). Split the upload |
| Time until the server starts answering | **100 to 120 seconds** (only Enterprise can raise it), then error 524 | None | Affected: making the results download, exporting or importing a study, a very large upload or deploy (the exports are built completely before the answer starts). Fine for ordinary studies; measure with your largest one |
| Size of a download | No limit for answers that aren't cached | None | Results downloads of any size pass |

### 8. Attacks, WAF and rate limiting

- **Floods (DDoS)** are stopped by Cloudflare on every plan, without
  settings, as long as step 3 holds.
- **The managed WAF rules** look for attack patterns. Research material can
  look like one (a unit with HTML or SQL, an answer that quotes code). If an
  upload or answer is refused with a Cloudflare page, look in *Security ›
  Events* and add an exception for `/api/` (how far the Free plan lets you
  is unverified).
- **Rate limiting**: the Free plan has one rule. Use it for the login: "URI
  path starts with `/api/auth/`", 20 requests per 10 seconds. The server's
  own limits do the rest, which is why step 4 matters. A class or a lab
  behind one address is normal: don't block an address for many requests to
  `/api/d/`.
- **Turnstile** (Cloudflare's "are you human" check) is not built. It would
  help against scripts filling an open crowd link with sessions, but needs
  code and a wider security policy, and the cookie reasoning above would
  have to be looked at again.

## Security-relevant settings

What to get right on any server ([security](security.md) has the reasoning):

- **Secrets**: `ANNOTINDER_SECRET` (32+ characters), `POSTGRES_PASSWORD` and
  `OIDC_CLIENT_SECRET` come from `openssl rand -hex 32`; `.env` is readable
  by its owner only and never committed.
- **`ANNOTINDER_PUBLIC_URL`** starts with `https://` (it turns on HSTS), and
  the site is opened only at that address: the login's cookie belongs to it.
- **The port**: the app listens on `127.0.0.1` only, behind the proxy.
- **`ANNOTINDER_TRUST_PROXY`** says what is in front: `none` (default;
  browsers connect directly), `proxy` (one reverse proxy that is the only
  way in; `compose.yml` sets it) or `cloudflare`. Set it to what is true:
  with a wrong value, rate limits are counted under the wrong address or
  can be dodged with a header.
- **Second factor**: leave `AUTH_INSECURE_DISABLE_2FA` and
  `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` unset on any server with
  research data. They are for teaching servers; the server warns at every
  start and *Server admin* shows them permanently.
- **Never on a server**: `AUTH_DEV_MODE`, `ANNOTINDER_DEMO`,
  `ANNOTINDER_RATE_LIMITS=off` (a load test from one machine only).
- **`ANNOTINDER_NEW_SESSIONS_PER_ADDRESS`** (default 500 per 10 minutes) is a
  brake only, since a class can share one address; lower it only if you see
  abuse.
- **`ANNOTINDER_FRAME_ANCESTORS`**: empty unless another site (e.g. AmCAT)
  shows AnnoTinder in a frame.
- **Admins**: two people, with a second factor, in `ANNOTINDER_ADMINS`.
- **Registration**: invite-only unless you want strangers to create studies
  and public links on your domain (*Server admin › Registration*, plans and
  limits: [accounts](accounts.md) §2 and §3).
- **Backups hold everything**, unencrypted on the server: restrict who can
  read `backups/`, and encrypt what leaves the machine.

## Settings

Environment variables; an empty value counts as unset. `.env.example` lists
those for `compose.yml`.

| Variable | What |
| --- | --- |
| `ANNOTINDER_VERSION` | Compose only: the release to run (the image tag) |
| `ANNOTINDER_PUBLIC_URL` | Where browsers reach AnnoTinder, no path or trailing slash. The login callback is `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`; `https://` turns on HSTS. Required with `DATABASE_URL` (the server doesn't start without it, except in development mode) |
| `ANNOTINDER_SECRET` | Signs login state, preview links and download links (`openssl rand -hex 32`); at least 32 characters. Required with `DATABASE_URL`; without it (development) these end at every restart |
| `DATABASE_URL` | Postgres, e.g. `postgres://user:pass@host:5432/annotinder` (compose sets it). Without it: PGlite in `PGLITE_DIR` (development) |
| `OIDC_HOST`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | The login provider's issuer and client. Without them nobody can log in |
| `OIDC_MFA_CLAIM` | Which ID token claim is a second factor: `amr:mfa` (default) or `acr:<value>` ([security](security.md) §1) |
| `OIDC_ACCOUNT_URL` | The provider's account page for setting up a second factor; required unless `AUTH_INSECURE_DISABLE_2FA` |
| `OIDC_PREVIOUS_HOST`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_MFA_CLAIM`, `OIDC_PREVIOUS_UNTIL` | The previous provider while changing providers, until a date ([accounts](accounts.md), "Changing providers") |
| `AUTH_STEP_UP_MAX_AGE` | Seconds a second factor stays fresh for sensitive actions (default 600) |
| `AUTH_INSECURE_DISABLE_2FA`, `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` | `true`: weaker security, for teaching and servers without sensitive data ([security](security.md) §1) |
| `ANNOTINDER_ADMINS` | Comma-separated addresses that get the admin role at login |
| `ANNOTINDER_TRUST_PROXY` | What is in front of the server, which says where the client's address (for rate limits) comes from. `none`: the connection. `proxy`: the last entry of `X-Forwarded-For`; only when the server is reachable only through one proxy (`compose.yml` sets it as its default). `cloudflare`: `CF-Connecting-IP` for requests that reached your proxy from Cloudflare ([The visitor's real address](#4-the-visitors-real-address)). Any other value: the server doesn't start. Outside compose the default is `none` |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (e.g. a load test from one machine) |
| `ANNOTINDER_NEW_SESSIONS_PER_ADDRESS` | How many new coder sessions one address may ask for per 10 minutes (default 500: a brake only, since a whole class can share one address), or `off` |
| `ANNOTINDER_FRAME_ANCESTORS` | Origins (space or comma separated) that may frame AnnoTinder, e.g. `https://amcat.example.org` |
| `ANNOTINDER_OPERATOR` | Who runs this server (a person, lab or organisation), shown on its "About this server" page (`/about`, linked from the start page and the coder home; `GET /api/info`). This and the next four are optional; what is not set shows as "Not stated" |
| `ANNOTINDER_HOSTING` | Where the server is hosted, in your own words, for every part: the VM, the database, the backups and a proxy in front |
| `ANNOTINDER_CONTACT` | How to reach whoever runs the server: an email address (shown as a link) or other text |
| `ANNOTINDER_PRIVACY_URL`, `ANNOTINDER_TERMS_URL` | The web addresses (`https://...`) of this server's privacy statement and terms of use. Anything else: the server doesn't start |
| `ANNOTINDER_COMMIT` | The commit recorded with each deployment and shown on the "About this server" page; a build argument of the image (the published image has it) |
| `POSTGRES_PASSWORD` | Compose only: the database password |
| `PORT` | Default 8787 |
| `HOST` | Where to listen. Default all addresses (development mode: localhost) |
| `PGPOOL_MAX` | Database connections per server process (default 20) |
| `PGLITE_DIR` | Without `DATABASE_URL`: the PGlite folder (default `packages/server/.pglite`) |
| `ANNOTINDER_CLIENT_DIR` | The built client (the image sets it) |
| `ANNOTINDER_FILES_DIR` | Where results downloads are kept (default: a folder in the temp folder; in the image that is inside the container, so it is emptied when the container is replaced). A cache: losing it only means the next download is written again. One file per study, replaced by the next download; it holds coders' answers, so it is removed when the study is deleted, a coder's data is deleted or answers are reset |
| `ANNOTINDER_DEMO` | `1`: an empty database gets the demo study. Development only |
| `AUTH_DEV_MODE` | `1`: development auth headers instead of a login; the server only starts if it listens on localhost. **Never on a server others use** |

**A database outside the compose file (untested).** Set `DATABASE_URL` to
the provider's address with TLS on (`?sslmode=verify-full`, and the
provider's CA certificate in the container: `NODE_EXTRA_CA_CERTS`) and drop
the `db` and `db-backup` services from `compose.yml`. Use the direct
connection, not a pooler in "transaction mode" (the server takes a lock for
its migrations that needs a real connection, and keeps its own pool of
`PGPOOL_MAX` connections); the plan must allow more connections than
`PGPOOL_MAX` times the number of app processes; and use Postgres 18, the
version `compose.yml` runs (the tests also ran on 16). Backups are then the
database's, and yours to arrange.

**Command-line tools**, run in the app container with the server's database
settings:

- `docker compose exec app node dist/keys.js create --email <address> --label <label>`:
  an API key for a user (also `list`, `revoke`).
- `docker compose exec app node dist/identities.js reset --yes`: forget all
  login identities after changing providers ([accounts](accounts.md)).

## Login provider

Researchers, and coders whose link asks for it, log in with an OpenID
Connect provider: your institution's (recommended: it has a helpdesk for
account recovery), or one such as Keycloak, Authentik, Zitadel or
SURFconext. One provider per server (two only while moving from one to the
other).

The server depends on it: while the provider is down nobody can log in
(people who are logged in, and coders without sign-in, go on). **For a
public server** the provider is itself a public service: its registration
page is where bots arrive, it sends the mails to verify addresses and reset
passwords (AnnoTinder sends none), and someone must help people who lost a
second factor.

- Register a confidential web client with redirect URI
  `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`, PKCE S256, and post-logout
  redirect URI `<ANNOTINDER_PUBLIC_URL>/` (with the trailing slash; Keycloak:
  **Valid post logout redirect URIs**). The server asks for `openid email`.
- **Two logins, with their own lifetimes.** The provider is used to log in
  only: AnnoTinder keeps no access or refresh tokens and has its own session
  (14 days from its last use). The provider's session (single sign-on, per
  browser) is what lets the next login through without a password; on
  Keycloak it ends after **SSO Session Idle** (default 30 minutes) or
  **SSO Session Max** (default 10 hours). So AnnoTinder stays logged in
  after the provider's session has ended, and changes at the provider (a
  blocked account, a new address, a new second factor) count from the next
  login: to lock someone out at once, block them in AnnoTinder
  ([accounts](accounts.md)). Details: [security](security.md) §1, "The
  session".
- **Logging out ends the provider's session too** (OpenID Connect
  RP-Initiated Logout), when the provider publishes an
  `end_session_endpoint` (Keycloak does): after AnnoTinder's session ends,
  the browser goes to the provider with the login's ID token and comes back
  to the home page, so the next login asks again. Other applications in that
  browser keep their own sessions, but can't log in through the provider
  without a password any more; on Keycloak, their (online) refresh tokens
  belong to that session and stop working, offline tokens don't. Other
  browsers and devices are not affected. Without an `end_session_endpoint`
  logout is AnnoTinder's only, and the next login can be instant while the
  provider's session lasts.
- The ID token must carry the **verified email address** (`email_verified:
  true`; else the login is refused) and **a second factor signal**
  (`OIDC_MFA_CLAIM`: `amr` containing `mfa` by default, or an `acr` value).
  The provider must honour **step-up** (`max_age`) and return `auth_time`,
  and have an account page where users set up a second factor
  (`OIDC_ACCOUNT_URL`; OpenID Connect has no standard way to find it).
  Details: [security](security.md) §1.
- On Keycloak that means a confidential client with standard flow only, PKCE
  S256 (**Advanced** tab), the `email` and `amr` scopes as default, and for
  `amr` the AMR mapper with reference values (`pwd`, `mfa`), so the ID token
  has `"amr": ["pwd", "mfa"]`.
- **For teaching or a low-sensitivity server** with a provider lacking these
  (e.g. a free Auth0 tenant): `AUTH_INSECURE_DISABLE_2FA=true` or
  `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION=true`. Never with sensitive
  research data. Step-up can't be turned off.
- Users are their login at the provider (`iss` + `sub`), not their address.
  To change providers, keep the old one for a while (`OIDC_PREVIOUS_*`) so
  users link their new login, or let users re-claim accounts by email
  (`identities.js reset`): [accounts](accounts.md), "Changing providers".

## Moving a study

**Settings › Export study** downloads the whole study as one file
(`<study>_<date>.annotinder.gz`): units, design versions, deployments, links,
coders, devices and answers. **Create new study › From a file** imports it, on
this or another server, as a new study, with or without coders and answers.
Exporting is for the study's ADMINs and is a sensitive action: the file holds
coders' data.

- **Format** (`StudyExportManifestSchema`): gzipped JSON lines, a manifest
  (release, last migration), then each row as stored.
- **Coders' email addresses** (the ones sessions signed in with, and the
  ones researchers gave their expert coders) are in the file only if the
  deployed design asks coders to sign in.
- **Import** loads the rows into an empty in-memory database at that
  migration, applies newer migrations, and copies the result in one
  transaction. Exports from older releases open on newer ones; from a newer
  release they are refused. The file is checked before anything is written
  (settings, every design version, the deployed design, every row's
  references): a file that fails is refused (400 `export_invalid`, with the
  issues) and nothing is created.
- **Size**: the upload can be 256 MB, and the file can unpack to at most
  400 MB of JSON lines. The import holds the rows in memory. Behind
  Cloudflare the upload limit is 100 MB ([Limits of the proxy](#7-limits-of-the-proxy)).
- **What changes**: every row gets a new id; the importer owns the study;
  links get new secrets (send coders the new links); coders' browsers can't
  continue, but a coder who logged in finds their session by logging in.
  Other users and their roles, leases and transfer links stay behind. The
  importer's limits apply (units, coders and answers per study, units in all
  their studies): 403 `limit_reached` otherwise.

## The database schema

The server applies the migrations in `packages/server/migrations` it doesn't
have yet at start (recorded in the `drizzle` schema), in order and under a
lock, so several processes can start at once. From 0.9.0 on, released
migrations are frozen and only add ([Updating](#updating)). Changing the
schema is a development task: `packages/server/README.md`.

## Versions

Each deployment records the release and commit it ran on (the deploy history,
and `design.json` in the results). The release is in the code; the commit
comes from `ANNOTINDER_COMMIT`, which the image takes as a build argument
("unknown" without it, which the smoke test reports). `GET /api/health`
answers `{ ok: true, service, release, commit }` without asking the
database; `GET /api/ready` asks it too and answers `{ ok, service, database }`,
with status 503 when the database doesn't answer.

CI (`.github/workflows/image.yml`) builds the image for amd64 and arm64,
starts it against Postgres (it must answer `/api/ready`), and publishes it as
`ghcr.io/ccs-amsterdam/annotinder`:

- every push to a branch: tagged with the branch (`main`; a `/` in its name
  becomes `-`), so a branch can be tried on a test server before it is
  merged;
- a tag `v<release>` (e.g. `v0.9.0`): also `0.9.0`, `0.9` and `latest`. The
  release is `RELEASE` in `packages/contracts/src/version.ts`; CI refuses a
  tag that doesn't match it.

A server picks one with `ANNOTINDER_VERSION` in `.env`: a release on a real
server, never a branch, so it doesn't change under you on the next pull. The
first time CI publishes the image, GitHub makes the package private: make it
public once (the package's **Package settings**), so servers pull it without
logging in.

Each push to a branch moves its tag to the new image and leaves the previous
image untagged. A weekly job (`.github/workflows/image-cleanup.yml`) deletes
untagged images older than 30 days; releases and branch tags stay. A server
that already runs a deleted image keeps running it, but can't pull it again:
another reason to run a release.

### Building the image yourself

To run your own changes, or without the published image, build it from a
checkout with `compose.build.yml` next to `compose.yml`:

```bash
ANNOTINDER_COMMIT=$(git rev-parse --short=8 HEAD) docker compose -f compose.yml -f compose.build.yml up -d --build
```

With `COMPOSE_FILE=compose.yml:compose.build.yml` in `.env`, plain `docker
compose` commands use both files. `ANNOTINDER_VERSION` must still be set (any
value: the build replaces the image). A checkout with uncommitted changes
still records only the commit, so use the published image when a study's
record matters.

## Capacity

In short: the launch workload (50 studies, 500 coders at once, a million
answers) fits on one machine with 4 cores and 8 GB, app and database
together, with room to spare for coding. What needs watching is not the
number of coders but one researcher opening the results or an export of a
single very large study.

### The benchmark

`pnpm bench <preset>` (`packages/server/scripts/bench.mjs`) starts the
server on a fresh PGlite database, or on the Postgres of `DATABASE_URL`
(give it a database of its own: the studies stay in it), creates the
preset's studies and lets simulated coders code: each starts a session,
answers a question about themselves, then fetches units five at a time and
submits them one by one, waiting the time per unit (+-50%) in between. The
studies are of three kinds, as coders meet them: a crowd sharing a queue
(two coders per unit), a crowd where everyone codes all units, and experts
with their own units and a link each. Coders arrive at ten a second. It
prints, and writes to `bench/<date>-<preset>-<database>.json`, the latency
percentiles per kind of request, the errors, a probe that calls
`GET /api/health` every 100 ms (a slow answer means the one server process
was busy) and the server process's memory and processor time. The run fails
(exit 1) on an error or over the preset's limits.

| Preset | Studies | Coders | Time per unit | Runs for | Limits |
| --- | --- | --- | --- | --- | --- |
| `smoke` | 3 (2,200 units) | 20 | 0.5 s | 20 s | no errors (for CI, on PGlite) |
| `pilot` | 5 (8,500 units) | 50 | 2 s | 90 s | no errors, submit p95 < 250 ms, next p95 < 500 ms, probe < 500 ms |
| `public` | 4 (32,000 units) | 500 | 10 s | 5 min | **the launch criteria**: no errors, submit p95 < 100 ms, next p95 < 250 ms, probe < 250 ms |
| `many-studies` | 50 (92,500 units) | 500 | 10 s | 5 min | the launch criteria |
| `stress` | 4 (42,000 units) | 500 | 1 s | 2 min | no errors (finds where it saturates) |
| `large-queue` | 1 shared queue of 50,000 units | 300 | 2 s | 3 min | no errors (what a long queue costs) |

`pnpm bench:seed` makes a large existing data set (default: 50 studies of
2,000 units with a million answers in all) and times the researcher's pages
and exports on it. `scripts/load-test.mjs` runs one scenario against a
server that is already running.

### What was measured

On 24 November 2026, on a development container, **not on a server**: 4
cores (shared with the simulated coders and with Postgres), 16 GB, Node 22,
one server process run from source, and **Postgres 16.15** with its default
settings (`shared_buffers` 128 MB), on the same machine. The results are in
`bench/2026-11-24-*.json`. Latencies in ms.

| Preset | Units submitted per second | Next batch p50 / p95 / p99 | Submit p50 / p95 / p99 | Probe, highest | App: share of one core | App: memory at most | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pilot` | 23.7 | 14 / 30 / 58 | 13 / 26 / 41 | 134 | 0.18 | 216 MB | 0 |
| `public` | 47.0 | 26 / 62 / 91 | 12 / 36 / 57 | 38 | 0.36 | 280 MB | 0 |
| `many-studies` | 47.1 | 13 / 27 / 43 | 10 / 21 / 30 | 40 | 0.27 | 233 MB | 0 |
| `stress` | 188.9 | 888 / 1,296 / 1,525 | 1,322 / 1,952 / 2,206 | 134 | 0.89 | 378 MB | 0 |
| `large-queue` | 126.7 | 277 / 799 / 956 | 157 / 641 / 865 | 185 | 0.92 | 356 MB | 0 |

- **The launch workload passes its criteria** with a wide margin, with 4 or
  with 50 studies live. 500 coders at 10 s per unit are 47 submitted units
  and 9 fetched batches a second; the app used about a third of one core for
  it, Postgres about a fifth (sampled from the processes' processor time
  during `many-studies`: a rough figure).
- **It saturates at about 190 submitted units a second** (230 requests),
  four times the launch workload. The limit is the one server process: it
  used 0.89 of a core, on a machine it shared with the 500 simulated
  coders. Past that point requests wait (seconds), but none failed.
- **A shared queue of 50,000 units** costs more per request: it saturated
  at about 125 units a second, with a fetch taking 0.3 s at the median. The
  health probe stayed under 0.2 s, so other studies were still served.
- **Arriving all at once is the heavier moment.** A first `public` run let
  the 500 coders arrive within 10 s (50 new sessions a second): no errors,
  but starting a session took 0.15 s at the median and 0.66 s at p95, and
  fetching a batch 0.26 s at p95. With ten arrivals a second (the table) a
  session starts in 15 ms.
- Uploading units through the API (200 per request) ran at 400 to 800
  units a second.

The same presets on PGlite (development and tests) only show that things
work. Never read capacity from them.

**A large existing data set** (Postgres 16, a million answers; first call
after a start, then the same call again; ms):

| Read | 50 studies, 21,000 answers in the one read | 1 study with all 1,004,000 answers (2,004 coders, 10,000 units) |
| --- | --- | --- |
| Overview | 81, then 72 | 4,446, then 4,373 |
| Deployment status | 79, then 101 | 5,007, then 5,500 |
| Coders | 40, then 33 | 1,160, then 1,289 |
| Results: answers | 117, then 6 | 1,572, then 7 |
| Results: agreement | 170, then 10 | **54,562**, then 186 |
| Results: units | 139, then 17 | 2,269, then 14 |
| Results: coders | 59, then 9 | 1,594, then 9 |
| Annotations, one page | 40 | 26 |
| Results export (written once) | 736, then 19 | **23,848**, then 82 |
| Study export (`.annotinder.gz`) | 1,034 (0.5 MB) | **33,862** (15 MB) |
| A coder comes back: session, summary, next units | 70, 85, 46 (100 finished units) | 101, 101, 58 (250 finished units) |
| App memory after these reads | 237 MB | **1,891 MB** |
| Database size | 787 MB | 632 MB |

- With the answers spread over 50 studies, every page of a study answers
  within about a second, and coders don't notice the size at all.
- **One study with a million answers is the first limit**: agreement takes
  close to a minute the first time, the exports half a minute, the overview
  and the status 4 to 5 s on every call, and the app's memory goes to
  1.9 GB. Not measured: whether coders wait while the server computes these
  (the probe didn't run during the reads).
- Sizes: the answers table is 0.46 GB per million answers with its indexes;
  the finished units and the hand-out log add 0.15 GB per 500,000 finished
  units; 100,000 units of about 500 characters are 0.13 GB.

The runs were repeated on 25 November on a busy machine (load average 10 to
21 on 4 cores): every preset ran without errors, with latencies two to three
times higher. That shows that the scripts follow the API, not what the
server can do.

### Sizing

Measured above: the app's processor share and memory under coding, the
database's size, the reads. **Extrapolated**: everything about the server. The
database's memory was not measured (it ran with 128 MB of `shared_buffers`
and the machine's file cache), nor HTTPS and the proxy, nor an import of a
very large study, nor several server processes.

| | A pilot | A busy server |
| --- | --- | --- |
| The load | 5 studies, 50 coders at once, some 100,000 answers | 50 studies, 500 coders at once, a million answers |
| Requests | 5 units a second at 10 s per unit (measured at 24: 0.18 of a core) | 47 units and 9 batches a second (measured) |
| App | under 0.1 of a core, 200 to 300 MB | 0.3 to 0.4 of a core, 300 MB while coding; **2 GB while a researcher reads the results of a very large study** |
| Postgres | under 0.1 of a core; 1 GB memory is plenty | about 0.2 of a core; 2 GB memory (`shared_buffers` 1 GB holds the whole database) |
| Database on disk | under 0.2 GB | 0.8 GB per million answers with their units; 2 to 4 GB with three questions per unit and growth |
| The machine | **2 cores, 4 GB, 40 GB disk** | **4 cores, 8 GB, 80 GB disk** |

- **Cores** are not what coding needs (under one core in all, at launch
  load): the second pair is for a researcher's heavy read or an export next
  to the coders, for Postgres' own background work, for the dumps and for
  the proxy.
- **Memory**: 8 GB for the busy server is the app at its measured worst
  (2 GB; set Node's `--max-old-space-size` to what the container may use,
  3 GB), Postgres (2 GB) and the file cache. On the pilot's 4 GB the same
  read of a very large study would not fit: a pilot has no such study.
- **Disk** is for the dumps, not for the database: a few GB of database,
  and every kept dump again ([Backups](#backups)).
- `PGPOOL_MAX` (20) was enough at every load measured; Postgres'
  `max_connections` (100) is above it.
- Several server processes are not needed for capacity at this size
  ([One app process](#staying-up)).

### On your server, before launch

The numbers above come from a shared development container with Postgres 16.
On your server, with the release's image and Postgres 18, run the benchmark
against an **empty database of its own** (never the live one: it needs
development auth and adds studies): `pnpm bench public` and
`pnpm bench many-studies` must pass the launch criteria; `pnpm bench stress`
and `pnpm bench large-queue` show where it saturates; `pnpm bench:seed` (once
with `STUDIES=1 UNITS=10000 SESSIONS=2000 UNITS_PER_SESSION=250`) shows the
reads on a large study and the app's memory after them. Better still, run
the simulated coders from another machine (`scripts/load-test.mjs`).
