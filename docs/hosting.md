# Hosting

How to run an AnnoTinder server: the lab's server on a university VM, and a
public server behind the Cloudflare proxy. The checklists that go with this
guide are in [`plans/go-live.md`](plans/go-live.md); the legal drafts in
[`legal/`](legal/README.md).

AnnoTinder is one Node server that also serves the built client (one origin,
so session cookies work), plus a Postgres database. Nothing else: no Redis,
no queue, no mail server ([why](#does-it-need-redis-or-another-key-value-store)).
The `Dockerfile` builds server and client into one image; `compose.yml` runs
it with Postgres and a daily database dump.

**Contents**

- [The recommendation in short](#the-recommendation-in-short)
- [A server on one VM, step by step](#a-server-on-one-vm-step-by-step): DNS,
  the VM, settings and secrets, the first admin, updating, logs
- [Backups](#backups): three layers, the restore test, dumps or continuous
  archiving
- [Monitoring](#monitoring)
- [Staying up](#staying-up): what can fail, and what each level of
  protection costs
- [The public server](#the-public-server): several VMs or one, where
  Postgres runs, costs, [Cloudflare in front](#cloudflare-in-front)
- [Does it need Redis or another key-value store?](#does-it-need-redis-or-another-key-value-store)
- Reference: [another machine](#with-docker-compose-elsewhere),
  [settings](#settings), [login provider](#login-provider),
  [database schema](#the-database-schema), [moving a study](#moving-a-study),
  [versions](#versions), [capacity](#capacity)

**What was tested, and what was not.** The compose file, the image, the
daily dumps, the in-place restore test and the smoke test were run (locally,
with the built image). Marked **(untested)** below: everything written from
documentation and not run for this guide: the restic commands, the Caddy
configuration for Cloudflare, the firewall rules, every Cloudflare setting,
the standby database, hourly dumps, and a database outside the compose file.
Try each on a test machine before you rely on it. Prices and Cloudflare's
limits come from search results of November 2026 (the providers' own pages
could not be opened while writing); they are marked **(unverified)**. Check
them on the provider's page before you decide.

## The recommendation in short

| | The lab's server | The public server (to start) |
| --- | --- | --- |
| Where | A university VM | One VM: a university VM or an EU hosting provider |
| What runs | `compose.yml`: the app, Postgres, daily dumps. Caddy on the VM for HTTPS | The same |
| In front | Nothing: Caddy gets a Let's Encrypt certificate | The Cloudflare proxy (Free plan), if the privacy officer agrees ([Cloudflare in front](#cloudflare-in-front)) |
| Size | 2 cores, 4 GB memory, 40 GB disk | 4 cores, 8 GB, 80 GB ([Capacity](#capacity)) |
| Backups | Daily dump, the VM's snapshots or nightly backup, encrypted copies off the machine | The same, with hourly dumps while studies collect data, and the copies at **another** provider |
| When the VM dies | Restore on a new VM: a few hours. Ask IT whether the VM restarts by itself on other hardware | The same. A standby machine is the next step, when the server has proven it is needed ([Staying up](#staying-up)) |
| Login | The lab's Keycloak | A provider open to the public ([Login provider](#login-provider)) |

Start both as one VM. One VM with tested backups is offline for a few hours
in a bad year; a setup with several machines that nobody has rehearsed is
offline longer, and more often. Not recommended: Kubernetes
([why](#one-vm-several-processes-or-several-vms)).

## A server on one VM, step by step

From an empty Ubuntu 24.04 VM to AnnoTinder on HTTPS, with researchers
logging in through the lab's Keycloak. It follows the lab's conventions
(societal-analytics-lab-infra: *Installation: university VMs*, *Apps on our
servers*, *Docker Compose standards*): Caddy on the VM does HTTPS; the app
lives in `/opt/annotinder`, owned by the system account `sal`; Docker runs
with `sudo`; ports are open on `127.0.0.1` only. There is no lab authwall in
front: AnnoTinder has its own login.

The public server follows the same steps, with another login provider
(step 4) and [Cloudflare in front](#cloudflare-in-front) instead of step 1
and part of step 7.

Replace `annotinder.example.org` with the server's hostname.

**Before you start:**

| What | For |
| --- | --- |
| The hostname, and someone who can add a DNS record | Step 1 |
| An admin account on the VM, with `sudo` | Every step |
| Admin access to the `idp` realm of the lab's Keycloak (or a lab admin who creates the client) | Step 4 |
| The email addresses of the first admins (two people, not one), each with an `idp` account, a verified address and a second factor | Steps 5 and 9 |
| A password manager entry for this server: its secrets go there too | Step 5 |

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

### 5. Settings and secrets

```bash
cd /opt/annotinder && sudo -u sal cp .env.example .env && sudo -u sal chmod 600 .env
sudoedit -u sal /opt/annotinder/.env
```

Generate the two secrets with `openssl rand -hex 32` (hex needs no quoting).

| Setting | Value on the lab's server | Why |
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

**The secrets.** `.env` holds three: `ANNOTINDER_SECRET`, `POSTGRES_PASSWORD`
and `OIDC_CLIENT_SECRET`. Keep a copy of all three in the password manager,
with the restic password of [Backups](#backups): a restored server needs the
same `.env`.

- The file is readable by `sal` only (`chmod 600`) and git ignores it.
- **Losing `ANNOTINDER_SECRET`**, or changing it, is not a disaster: logins
  in progress, preview links and download links stop working. Researchers'
  sessions and coders' sessions are in the database and go on.
- **Changing `POSTGRES_PASSWORD`** in `.env` alone breaks the app: Postgres
  keeps the password it was created with. Change it in the database first
  (`ALTER USER annotinder PASSWORD '...'`), then in `.env`.
- Today the server starts without `ANNOTINDER_SECRET` (a warning in the log)
  and without `ANNOTINDER_PUBLIC_URL` (it then assumes `http://localhost`).
  Check the startup lines of step 6 (release plan, B7-04, turns both into
  errors).

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

Caddy writes no access log unless you add a `log` line to the site. Leave it
that way, or remove the query string from what is logged: coder links carry
their secret there (`?link=...`), next to panel ids.

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

### 9. The first admin

The first admins are the addresses in `ANNOTINDER_ADMINS` (step 5). Name two
people: when one is away or loses a second factor, the other can still manage
the server. An address there gets the admin role each time it logs in, with
a verified address; the role only works on a login with a second factor
(`security.md` §1). Admins can make others admin in *Server admin › Users*;
those don't need to be in `.env`.

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

### 10. Registration, backups and monitoring

Before anyone else gets in:

- **Who may create studies**: *Server admin › Registration*. For an
  invite-only server: "anyone who logs in" off, no email domains, and decide
  whether people may send a request. Invite researchers by address in *Server
  admin › Users*. **AnnoTinder sends no email**: tell them yourself. An
  invitation is good for 3 months. The default plan (*Plans*) starts at 20
  studies, 50,000 units per study, 200,000 units in total, 5,000 coders and
  2,000,000 answers per study: lower it for accounts you don't know
  (`accounts.md` §3).
- **Backups**: the daily dump runs by itself. Set up the copies off the
  machine and do one restore test: [Backups](#backups).
- **Monitoring**: three checks, an hour of work: [Monitoring](#monitoring).

### 11. Updating

```bash
cd /opt/annotinder && sudo docker compose restart db-backup     # a fresh dump
sudo -u sal git pull
sudo ANNOTINDER_COMMIT=$(sudo -u sal git rev-parse --short HEAD) docker compose up -d --build
```

The server applies new migrations at start. Run the smoke test afterwards (it
prints the new commit). The server is away for some seconds while its
container is replaced: update at a quiet hour.

- **Before the first release tag, a database can't always be updated.** Until
  then the first migration is regenerated in place when the schema changes
  (release plan, B7-01, D24), and the server skips a migration it has
  already applied without noticing that the file changed: the database then
  no longer fits the code. A server installed before the tag is a pilot:
  expect to start it again with an empty database at the release, and tell
  researchers to keep their downloads. Study export files from before the tag
  are not supported either.
- **From the release tag on, migrations only add.** An update never needs a
  reset; exports from older releases open on newer ones.
- **Going back** to an older version after an update that changed the
  database: restore the dump made before the update (the first line above),
  then check out and build the older version. Answers given in between are
  lost, so decide fast.
- Clear old images now and then with `sudo docker image prune`.
- **Postgres** is pinned in `compose.yml`: a minor update (18.x) is a tag
  change; a major one (18 to 19) needs a dump, a new volume and a restore.
- **The operating system**: `setup-vm.sh` turns on automatic security
  updates. Rebuild the image every month or so even without a new AnnoTinder
  version (`docker compose build --pull`, then `up -d`), to get the updates
  of Node's base image.

### 12. Logs

- **Server**: `sudo docker compose logs -f app` (or `--since 1h`): startup
  (settings, login, admins), failed logins (`Login failed: ...`), errors. The
  server does not log requests (release plan, B7-05).
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

## Backups

Everything that matters is in the database: studies, units, answers,
accounts, sessions. Besides it, a server is its `.env` and this repository.
Results downloads on disk (`ANNOTINDER_FILES_DIR`) are a cache and need no
backup.

Three layers, each against a different accident:

| Layer | Protects against | Does not protect against |
| --- | --- | --- |
| 1. **Dumps on the VM** (the `db-backup` service) | A bad update, a deleted study, a damaged database | Losing the VM or its disk |
| 2. **Snapshots of the VM** (the provider's or IT's) | Losing the VM; a broken system update | A problem at the provider; whoever can delete the VM can delete its snapshots |
| 3. **Encrypted copies at another provider** (restic) | Losing the VM, the account or the provider; a break-in that wipes the server | Nothing, if the restore was tested and the password is not only on the server |

### Layer 1: dumps on the VM

The `db-backup` service dumps the database into
`/opt/annotinder/backups/annotinder-<date>.dump` at its start and daily at
02:00 UTC, and keeps 7 days (`BACKUP_TIME`, `KEEP_DAYS` in `compose.yml`).
The files are readable by root only and **not encrypted**. The database
volume itself is not backed up: the dumps are the backup.

- **Check**: `sudo docker compose logs db-backup` says `dump written`;
  `sudo ls -l backups/` lists it. A failed dump logs `ERROR: pg_dump failed`.
- **A dump now** (e.g. before an update): `sudo docker compose restart db-backup`.
  It replaces today's file.

Never run `docker compose down -v` or `docker volume prune`: they delete the
database volume.

**Hourly dumps** (the public server, while studies collect data). The
service writes one file per day, so hourly dumps are a line in root's
crontab (`sudo crontab -e`) **(untested)**:

```
7 * * * * cd /opt/annotinder && f=backups/hourly-$(date -u +\%H).dump && docker compose exec -T db pg_dump -U annotinder --format=custom annotinder > $f.partial && mv $f.partial $f
```

That keeps 24 files, each overwritten a day later. A dump reads the whole
database: fine up to some GB, where it takes a minute or two. Look at how
long it takes and how large the files are after the first month.

### Layer 2: snapshots of the VM

Ask the university's IT (or turn on at the hosting provider): daily
snapshots or backups of the whole VM, how long they are kept, and how to
get one back. A snapshot is taken while Postgres runs; Postgres recovers
from that like from a power cut. It brings back the whole machine in
minutes, which a dump can't. It is not enough alone: it lives where the VM
lives.

On the lab's VMs the nightly backup of `/opt` (*Backups* in the lab's docs)
takes `backups/` and `.env`. Ask where that backup is kept: if it is another
building and another system, it can stand in for layer 3 on the lab's
server.

### Layer 3: encrypted copies at another provider

[restic](https://restic.net) copies the dumps and `.env` to an S3 store. It
encrypts on the VM, so the store's provider can't read anything, and it keeps
old versions without storing unchanged data twice. (rustic is a compatible
rewrite; use restic unless you know why not.)

**Which store.** Any S3 store at a provider other than the VM's. For the
public server it should be in the EU:

| Store | Notes | Price **(unverified)** |
| --- | --- | --- |
| Cloudflare R2 with the EU jurisdiction | The bucket's data stays in the EU, but Cloudflare is a US company: name it as a supplier. Choose the jurisdiction when creating the bucket (it can't be changed later); the S3 address then has `.eu.` in it | $0.015 per GB a month, the first 10 GB free, no fee for downloading |
| Hetzner Object Storage, Scaleway Object Storage, OVHcloud Object Storage | EU companies | Hetzner: about €5 a month including 1 TB. Others: a few cents per GB |
| The university's own S3 or research storage (for example SURF's) | For the lab's server; may be the only place the data is allowed to go | Ask |

Dumps of a pilot are megabytes; of a busy public server a few GB. With the
retention below that is tens of GB at most: about a euro a month.

**Setting it up (untested).** Make a bucket and an access key that can only
reach that bucket. Then, as root on the VM:

```bash
sudo apt install restic
sudo install -m 600 /dev/null /root/restic.env && sudoedit /root/restic.env
```

```bash
# /root/restic.env
export RESTIC_REPOSITORY=s3:https://<account id>.eu.r2.cloudflarestorage.com/<bucket>
export RESTIC_PASSWORD_FILE=/root/restic.password
export AWS_ACCESS_KEY_ID=<access key>
export AWS_SECRET_ACCESS_KEY=<secret key>
```

```bash
sudo sh -c 'umask 077 && openssl rand -hex 32 > /root/restic.password'
sudo sh -c '. /root/restic.env && restic init'
```

**Put the restic password and the access key in the password manager now.**
Without the password the copies are noise. The server must not be the only
place that has it.

The nightly job, `/usr/local/bin/annotinder-offsite` (`chmod 700`), run from
root's crontab at `30 2 * * *` (after the 02:00 dump):

```bash
#!/bin/sh
# Copies the dumps and settings off the machine (docs/hosting.md, "Backups").
set -eu
. /root/restic.env
restic backup --tag annotinder /opt/annotinder/backups /opt/annotinder/.env /etc/caddy
restic forget --tag annotinder --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
# Tell the backup check that this ran (Monitoring): only reached when both commands worked
curl -fsS -m 10 --retry 3 "<the check's ping address>" > /dev/null
```

- `restic check` once a month reads the store's index for damage.
- **How far back the copies go is a privacy decision** as well as a safety
  one: data a researcher deleted stays in the copies until they expire
  (`legal/privacy-statement.md` §7). The numbers above keep a year; choose
  them on purpose and put them in the privacy statement.
- A break-in on the VM gets the access key and could delete the copies. Most
  stores can lock objects for a period (R2: bucket lock rules), or give a key
  that can add but not delete; set one of them up when the server holds data
  that can't be collected again **(untested)**.
- A dump is compressed, so two days' dumps share little that restic can
  skip. If the copies grow too fast, dump without compression
  (`DUMP_OPTIONS: "--compress=0"` on `db-backup` in `compose.yml`) and let
  restic compress **(untested)**.

### The restore test

A backup that was never restored is a hope. Two tests:

**In place, five minutes** (at setup, and after big changes). Loads the
newest dump into a scratch database next to the real one, counts studies,
drops it. The app keeps running. This one was run.

```bash
cd /opt/annotinder && dump=$(sudo ls backups | grep '^annotinder-' | sort | tail -n 1) && echo "$dump"
sudo docker compose exec -T db createdb -U annotinder restore_test
sudo cat "backups/$dump" | sudo docker compose exec -T db pg_restore -U annotinder -d restore_test --no-owner
sudo docker compose exec -T db psql -U annotinder -d restore_test -c "select count(*) as studies from studies"
sudo docker compose exec -T db dropdb -U annotinder restore_test
```

**On another machine, an hour** (before real data comes in, then once or
twice a year). This is the one that tells you whether you could survive
losing the VM, and how long it takes. Use a throwaway VM and only what is
outside the server: this guide, the password manager and the store. The
steps with restic are **untested**.

1. Steps 2 and 3 of the guide on the new VM (Docker, Caddy, `sal`, the
   repository at the same commit or a newer one, never an older one).
2. Get the files back:

   ```bash
   sudo apt install restic
   # /root/restic.env and /root/restic.password from the password manager
   sudo sh -c '. /root/restic.env && restic snapshots'
   sudo sh -c '. /root/restic.env && restic restore latest --target /tmp/restore'
   sudo -u sal cp /tmp/restore/opt/annotinder/.env /opt/annotinder/.env && sudo -u sal chmod 600 /opt/annotinder/.env
   ```

3. Start **only the database**, and load the dump before the app ever
   starts (the app would create its own empty tables first):

   ```bash
   cd /opt/annotinder && sudo docker compose up -d db
   dump=$(sudo ls /tmp/restore/opt/annotinder/backups | grep '^annotinder-' | sort | tail -n 1)
   sudo cat "/tmp/restore/opt/annotinder/backups/$dump" | sudo docker compose exec -T db pg_restore -U annotinder -d annotinder --no-owner
   ```

4. Start the rest (step 6 of the guide), and run the smoke test against
   `http://localhost:8787` on the VM. For a full test, point a test hostname
   at the VM and log in: with another hostname, the login needs that
   hostname in `ANNOTINDER_PUBLIC_URL` and as a redirect URI at the login
   provider.
5. Compare with the real server: the number of studies, and the latest
   answer of a study you know.
6. Write down the date, who did it and how long it took
   (`plans/go-live.md`), then delete the VM and `/tmp/restore`.

After a real restore under the real hostname, researchers stay logged in
and coders continue where they were, minus what happened after the dump:
both kinds of session are in the database.

**Restoring in place** (the VM is fine, the data is not; replaces the
database):

```bash
sudo docker compose stop app db-backup
sudo docker compose exec -T db dropdb -U annotinder annotinder && sudo docker compose exec -T db createdb -U annotinder annotinder
sudo cat backups/<dump> | sudo docker compose exec -T db pg_restore -U annotinder -d annotinder --no-owner
sudo docker compose up -d
```

### Dumps or continuous archiving?

With dumps you can lose what happened since the last one: a day, or an hour
with hourly dumps. Continuous archiving (Postgres writes every change to
the store as it happens; tools: pgBackRest, WAL-G, Barman) brings that down
to a minute or so and can restore to any moment, such as just before a
mistake.

| | Dumps | Continuous archiving |
| --- | --- | --- |
| Most you can lose | 24 hours, or 1 hour | About a minute |
| Restore to a chosen moment | No: only to a dump | Yes |
| Setting up | Done (`compose.yml`) | A day, plus changes to how Postgres runs in `compose.yml`, and its own restore test |
| Looking after | Almost nothing | Watch that archiving keeps up; a full archive disk stops the database |
| Works well up to | Some tens of GB (a dump reads everything) | Any size |

**Use dumps** for the lab's server and to start the public server: daily,
and hourly on the public server. **Move to continuous archiving** when one
of these becomes true: losing an hour of answers is not acceptable (a paid
panel study of thousands of participants); a dump takes more than about ten
minutes; or the database moves to a managed service, which does it for you
([Where Postgres runs](#where-postgres-runs)). pgBackRest is the usual
choice; its maintenance was stopped in April 2026 and taken up again with
new sponsors, with releases since **(from search results)**, so check how
it stands before you build on it.

Until then, tell researchers what the level is: "at worst, the answers of
the last hour (or day) are lost" (`legal/terms-of-use.md` §8).

## Monitoring

Three checks. Each must reach a person: an email to two people, or a chat
channel that is read.

1. **Is it up?** A check from outside the server's own network, every few
   minutes, on `https://<host>/api/health`, expecting `"ok":true`. Any uptime
   service does this (for example Uptime Kuma on another lab machine, or a
   hosted one). **`/api/health` does not look at the database**: it answers
   as long as the server process runs, also when Postgres is down
   (`plans/go-live.md`, P-06). So add a second check that does reach the
   database: `GET https://<host>/api/me` with the header
   `authorization: Bearer <api key>`, expecting status 200. Make the API key
   for an account without roles in any study; a key can't do sensitive
   actions. Or run the smoke test with a key from another machine, daily
   from cron: it exits with 1 when a check fails.
2. **Is the disk filling?** A full disk stops Postgres. The script below
   warns at 80%.
3. **Did the backup run?** A "dead man's switch": the backup job calls an
   address when it has finished (the last line of `annotinder-offsite`
   above), and the check warns when the call does **not** come for 26 hours.
   Uptime Kuma calls this a push monitor; healthchecks.io is the well-known
   hosted one. A check that only looks for errors misses the job that never
   started.

A small script for 2 and for the dump itself, hourly from root's crontab
**(untested)**. It calls a second dead man's switch only when all is well:

```bash
#!/bin/sh
# /usr/local/bin/annotinder-check: disk space and the age of the newest dump (docs/hosting.md, "Monitoring").
set -eu
used=$(df --output=pcent /opt/annotinder | tail -n 1 | tr -dc '0-9')
[ "$used" -lt 80 ] || { echo "disk at $used%"; exit 1; }
# A dump of the last 26 hours exists
[ -n "$(find /opt/annotinder/backups -name 'annotinder-*.dump' -mmin -1560)" ] || { echo "no recent dump"; exit 1; }
# All containers run and none is unhealthy
cd /opt/annotinder
[ -z "$(docker compose ps --format '{{.Name}} {{.Status}}' | grep -v ' Up ' || true)" ] || { echo "a container is down"; exit 1; }
[ -z "$(docker compose ps --format '{{.Name}} {{.Status}}' | grep unhealthy || true)" ] || { echo "a container is unhealthy"; exit 1; }
curl -fsS -m 10 --retry 3 "<this check's ping address>" > /dev/null
```

Also worth a look once a month: `sudo docker compose logs --since 720h app | grep -c 'Internal error\|Error'`,
the hardening warnings at the top of *Server admin*, and whether the VM
needs a reboot for a kernel update (`/var/run/reboot-required`).

Not built: an error tracker, and metrics. For one VM the three checks are
enough.

## Staying up

What can fail, and what it takes to come back:

| What fails | How often | With one VM and backups |
| --- | --- | --- |
| The app crashes, or the VM reboots | Now and then | Back by itself in under a minute (`restart: unless-stopped`; Docker starts at boot). Test it once: reboot, then the smoke test |
| An update goes wrong | Rare, if you test first | Restore the dump made before the update: 15 minutes |
| The hardware under the VM fails | Every few years | Depends on the platform: many restart the VM on other hardware within minutes. **Ask IT or the provider.** If not: a new VM and a restore, 1 to 4 hours once someone is at it |
| The disk or the VM is lost | Very rare | A new VM and a restore: 1 to 4 hours. You lose what happened since the last dump that left the machine |
| The data centre or the network is down | Hours, once in a few years | Wait, or restore elsewhere if it lasts |
| The login provider is down | With its maintenance | Coders go on (unless their link requires sign-in). Researchers who are logged in go on; nobody can log in |
| Someone deletes a study by mistake | It will happen | Restore the latest dump on a throwaway server (the restore test on another machine), export the study there and import it on the real one ([Moving a study](#moving-a-study)) |
| An attack floods the server | Public servers | Rate limits (`security.md` §3) help against one source; a real flood needs a proxy in front ([Cloudflare in front](#cloudflare-in-front)) |

**Making the lab's server as robust as is realistic**, without a second
machine:

- Ask IT the two questions: does the VM restart by itself on other hardware,
  and are there snapshots.
- All three backup layers, and one restore on another machine, timed.
- The three checks of [Monitoring](#monitoring), reaching two people.
- Two people who can log in to the VM and who know where the secrets are.
- Updates at quiet hours, after reading what changed; a dump first.
- A page that says what researchers can count on: "the server can be away
  for some hours; plan your data collection so that this does not ruin it".

That gives a server that is away a few times a year for minutes, and once
in some years for a few hours. Going beyond that means a second machine:

| Level | Away when the VM dies | Lost at worst | Costs | Work |
| --- | --- | --- | --- | --- |
| **One VM**, daily dumps | 1 to 4 hours | A day | One VM | Little |
| **One VM**, hourly dumps off the machine | 1 to 4 hours | An hour | The same | Little |
| **A warm standby**: a second VM, at another provider or site, with a copy of the database that follows the first one live (Postgres streaming replication) and the app ready to start. Switching is done by hand: make the copy the main database, start the app, point the hostname at it | 15 to 30 minutes, once someone is at it | Seconds | Twice the VMs | Real: setting up replication, a check that the copy keeps up, a written switch procedure, rehearsed twice a year. Switching back is a second migration |
| **Two app VMs and a managed database** | Nothing for an app VM; the database's own switch takes about a minute | Seconds | Three to five times one VM, plus changes to the code | The most ([below](#one-vm-several-processes-or-several-vms)) |

The standby is switched **by hand** on purpose. Automatic switching needs a
third machine to decide who is alive; done wrong, both databases accept
answers and the data splits. With Cloudflare in front, pointing the hostname
at the standby takes effect in seconds (it is a change of the origin address
in the dashboard; visitors keep seeing Cloudflare's address).

## The public server

A server on the open internet, for researchers of any institution. Same
software, same steps. What differs: strangers find it, so it needs
protection in front; more people depend on it; and it needs legal texts
(`legal/README.md`). **This guide and the app say nothing about where a
server is hosted**: each server states that itself, on its own information
page (release plan, P-A3) and in its privacy statement, for every part: the
VM, the database, the backups and the proxy.

### One VM, several processes or several VMs?

| Setup | What it gives | What it costs | Verdict |
| --- | --- | --- | --- |
| **One VM**: app and Postgres together (`compose.yml`) | Everything this guide describes. Enough for hundreds of coders at once ([Capacity](#capacity)) | One VM | **Start here** |
| **One VM and a warm standby** at another provider or site ([Staying up](#staying-up)) | Back in half an hour instead of some hours; seconds of data lost instead of an hour | A second VM; a day or two to set up; a rehearsal twice a year | The next step, when the server has users who can't wait some hours |
| **Two app VMs** behind Cloudflare Load Balancing, with a **managed Postgres** in the EU | An app VM can fail or be updated without anyone noticing; the provider looks after the database, its switch-over and its backups | Two VMs, a managed database with a standby, the load balancer: several times one VM a month ([costs](#what-the-public-server-costs)). The code needs changes first ([below](#several-app-instances-what-works-today)) | Only when the load or the promises made ask for it. Not this year |
| **Kubernetes** | The same as the row above, in theory | A cluster to run, upgrade every few months and secure; a Postgres operator or a managed database anyway; knowledge nobody in a research group has time to keep | **Not recommended** |

**Why not Kubernetes.** It solves problems this server does not have: many
services, many teams, many deployments a day. AnnoTinder is one process and
one database. What makes it stay up is the database being copied to a second
machine and someone knowing how to switch, and Kubernetes does neither by
itself. It replaces "the VM is down" by "the cluster is misconfigured", which
is harder to find for a small team, and its upgrades are a steady job.

**University VMs, an EU hosting provider, or both?** A university VM is on
premises and costs nothing, but is meant for the university's own work: ask
whether it may serve researchers anywhere, and what happens with it when the
project's funding ends. A hosting provider needs a data processing
agreement and someone who pays the bill for years. Both together works well
as "runs at one, the standby and the backups at the other". It does not work
as two halves of one system: the app and its database must sit next to each
other, each query is a round trip.

### Several app instances: what works today

The server was built to run as several processes on one database, and has
never been run that way. From the code:

| What | With several instances |
| --- | --- |
| Coder sessions, answers, units, leases, shared queues | In the database, with database locks where coders are counted against each other. **Work** |
| Researchers' login sessions, API keys | In the database. **Work** |
| Rate limits | Counted in a database table shared by all. **Work.** One of them, the flood limit of 10,000 coder requests a minute per address, is counted per instance |
| A design that is deployed or changed | Each instance notices at its next request (a small query per request). **Works** |
| Migrations at start | Under a database lock: instances starting together apply them once. **Work**, but update all instances to the same version together |
| `ANNOTINDER_SECRET` | Must be the same on every instance (login state, preview links, download links) |
| **Researcher previews** | Kept in the memory of the instance that got the request. On another instance the preview starts again, empty. **Break** without "session affinity" (the load balancer sending a browser to the same instance each time), and end with every restart |
| **Results downloads** | The file is written to the instance's disk and the download link read from disk. On another instance: "this download link has expired". **Break** unless `ANNOTINDER_FILES_DIR` is a folder all instances share |
| A study's limit on answers | Counted per instance, read again once a minute: a little over the limit at worst |
| A link's settings | Cached per instance for up to a minute: a revoked link can work a minute longer on another instance |
| `/api/health` | Does not look at the database: a load balancer keeps sending visitors to an instance that lost its database |

So, before a second instance: previews in the database, or session affinity
at the load balancer (Cloudflare's sets one more cookie); results files in a
shared store (`plans/exports-and-files.md` plans S3); a health check that
includes the database; a `compose.yml` without the `db` service; and a
test of all of it under load. These are in `plans/go-live.md` (P-06, P-08,
P-09, P-15).

### Where Postgres runs

| Where | For | Against |
| --- | --- | --- |
| **On the app's VM** (`compose.yml`) | Nothing extra to pay or learn; no network between app and database; backups as in this guide | You look after it; it fails with the VM |
| **A managed Postgres** at an EU provider | Backups to any moment, updates and (on plans with a standby) switching over are the provider's work | Costs as much as the VM or more; must be in the same data centre region as the app, on a private network; a new supplier with the research data, so a data processing agreement and a line in the privacy statement; `compose.yml` and this guide assume the database is local (P-09) |
| **A second VM of your own** as standby | Cheap; you decide where it is | You set up and rehearse replication yourself ([Staying up](#staying-up)) |

EU providers with managed Postgres, from search results of November 2026
(**all prices unverified**; they changed several times in 2026):

| Provider | Company | Smallest useful plan |
| --- | --- | --- |
| UpCloud | Finland | About €30 a month for 1 core, 2 GB, 25 GB, one node; €60 for 2 cores, 4 GB, 50 GB. Plans with a standby cost about twice that |
| Scaleway | France | From about €11 a month for a 2 GB development node, plus storage; production nodes and a standby cost more |
| OVHcloud | France | No price found; has managed PostgreSQL in several EU regions |
| Aiven | Finland | No price found; runs on other clouds' data centres, so check which |
| Exoscale | Switzerland, with EU data centres | No price found |
| Hetzner | Germany | **No managed Postgres** (as far as could be found): VMs and storage only |

Services of US companies with EU regions (AWS RDS, Google Cloud SQL, Azure,
DigitalOcean, Neon, Supabase) work as well technically; whether they fit is
the privacy officer's question, the same one as for Cloudflare.

**If you use one (untested with AnnoTinder):** set `DATABASE_URL` to the
provider's address with TLS on (`?sslmode=verify-full`, and the provider's
CA certificate in the container: `NODE_EXTRA_CA_CERTS`); use the direct
connection, not a pooler in "transaction mode" (the server takes a lock for
its migrations that needs a real connection, and keeps its own pool of
`PGPOOL_MAX` connections); the plan must allow more connections than
`PGPOOL_MAX` times the number of app instances; and Postgres 18, the version
`compose.yml` runs (the tests also ran on 16).

### What the public server costs

Per month, rough, **unverified**:

| Part | To start | With a standby | Two app VMs and a managed database |
| --- | --- | --- | --- |
| VMs (4 cores, 8 GB; at Hetzner about €9 on shared cores to €36 on the regular line after the 2026 increases; other EU providers €20 to €50) | 1 | 2 | 2, smaller |
| Managed Postgres with a standby | | | €60 to €150 |
| Snapshots or the provider's backups | some euros (at Hetzner 20% on top of the VM) | the same | the same |
| Off-site copies | €0 to €5 | €0 to €5 | €0 to €5 |
| Cloudflare | Free plan: €0 | €0 | Load Balancing from about $5, more with more checks |
| The domains | €10 to €30 a year each | | |
| **Together** | **€15 to €50** | **€30 to €100** | **€110 to €260** |

A university VM makes the first row free. The larger cost is the time of
whoever looks after it.

### Cloudflare in front

What the Cloudflare proxy does on the Free plan: visitors connect to
Cloudflare, Cloudflare connects to the server. That hides the server's
address, absorbs flooding attacks, and keeps copies of the client's static
files close to visitors. AnnoTinder uses it as a proxy only: no Workers, no
other Cloudflare products.

**The price is privacy.** Cloudflare decrypts everything that passes:
answers, login cookies, uploads. It is a US company, and on the Free plan a
visitor is served by whichever of its data centres is nearest, anywhere in
the world. Keeping the decryption inside the EU is a paid extra (its "data
localisation" products; **unverified** which plans can buy it). So with
Cloudflare in front, a server is **not** "hosted in the EU" in the sense
that matters for an ethics application, even when the VM is: the privacy
statement must name Cloudflare and what it sees
(`legal/README.md`, decision 3). Ask the privacy officer before moving the
domain. If the answer is no: a proxy from an EU company, or no proxy and the
hosting provider's own protection against floods (most include some), with
Caddy and Let's Encrypt as on the lab's server.

The lab's server has no Cloudflare in front.

All of the steps below are **untested**; the settings' names are
Cloudflare's of late 2026 and move now and then.

#### 1. Bringing the domain to Cloudflare

On the Free plan Cloudflare must run the domain's DNS: you keep the domain
at its registrar and change its **nameservers** there to the two Cloudflare
gives you. (Proxying a domain whose DNS stays elsewhere needs the Business
plan.)

1. **Write down every DNS record the domain has now**, mail above all (MX,
   SPF, DKIM, DMARC, and TXT records that prove ownership to other
   services). Cloudflare scans for records when you add the domain and
   misses some. A missed mail record means lost mail.
2. **DNSSEC.** If it is on at the registrar, turn it off there and wait a
   day or two before changing the nameservers; otherwise the domain stops
   resolving for part of the internet. Many Dutch registrars sign `.nl`
   domains by themselves: ask or look.
3. Add the domain at Cloudflare (Free), check the records against your
   list, and change the nameservers at the registrar. It becomes active
   within hours, sometimes a day.
4. Turn DNSSEC on again, now at Cloudflare (*DNS › Settings*), and enter
   what Cloudflare shows at the registrar. For `.com` that is a DS record.
   For `.nl`, registrars usually ask for the public key itself (the DNSKEY:
   flags 257, algorithm 13) instead of the DS record; Cloudflare shows both
   **(from memory, unverified)**.
5. **Records.** The server: an `A` (and `AAAA`) record to the VM, **proxied**
   (orange cloud). Mail and verification records: **DNS only** (grey). Do
   not make an unproxied record that points at the VM (an `ssh.` name, for
   example): it gives away the address the proxy hides.
6. **One address for the app.** Cookies, the login's redirect address and
   `ANNOTINDER_PUBLIC_URL` belong to one hostname. Choose it
   (`annotinder.com`), and make `www` and a second domain (the `.nl`)
   redirect to it with a Redirect Rule. The second domain is its own zone
   at Cloudflare, also on the Free plan, with one proxied placeholder record
   for the rule to act on.

#### 2. HTTPS to the server: Full (strict)

*SSL/TLS › Overview*: **Full (strict)**. Never "Flexible": that sends
visitors' data from Cloudflare to the server unencrypted, and breaks the
login (the server sees `http`).

The server needs a certificate that Cloudflare accepts. The simplest is a
Cloudflare **origin certificate** (*SSL/TLS › Origin Server › Create
certificate*): free, valid up to 15 years, trusted by Cloudflare only. Save
the two files on the VM, readable by `caddy` only, and name them in the
Caddyfile:

```
annotinder.com {
	tls /etc/caddy/origin.pem /etc/caddy/origin.key
	reverse_proxy 127.0.0.1:8787 {
		# The visitor's address, from Cloudflare (step 4)
		header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
	}
}
```

Put the certificate's end date in a calendar. Also turn on *Always Use
HTTPS* (*SSL/TLS › Edge Certificates*). The server itself sends the HSTS
header, with `ANNOTINDER_PUBLIC_URL` starting with `https://`.

#### 3. Only Cloudflare may reach the server

Otherwise an attacker who finds the VM's address walks around the proxy,
and can fake the visitor's address of step 4. On the VM's firewall, allow
ports 80 and 443 from Cloudflare's address ranges only
(`https://www.cloudflare.com/ips-v4` and `ips-v6`), and SSH from your own
ranges as before:

```bash
sudo ufw delete allow 80/tcp && sudo ufw delete allow 443/tcp     # the rules setup-vm.sh --web made; check with: sudo ufw status numbered
for range in $(curl -fsS https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6); do
	sudo ufw allow proto tcp from "$range" to any port 443
done
sudo ufw status
```

Port 80 can stay closed: Cloudflare talks to the server on 443. The ranges
change a few times a year at most: run the loop again when Cloudflare
announces it (old ranges then stay allowed; clean up once a year). A
university's own firewall in front of the VM needs the same ranges. If the
VM's address was public before (the pilot), ask for a new one for the public
server.

#### 4. The visitor's real address

The server limits requests per address (`security.md` §3), and takes the
address from the **last** entry of `X-Forwarded-For` (`shared/rateLimit.ts`).
Behind Caddy alone that is the visitor. Behind Cloudflare and Caddy it is a
Cloudflare data centre: Caddy puts the address of whoever connected to it in
that header, and that is Cloudflare. All visitors behind one Cloudflare
address would then share one limit: 60 logins a minute, 300 new coder
sessions a minute.

The `header_up` line in the Caddyfile of step 2 fixes this by replacing the
header with `CF-Connecting-IP`, the visitor's address as Cloudflare saw it.
It is only safe together with step 3: otherwise anyone can send that header.

**Test it** before the server opens. Open the login page in a browser, then:

```bash
sudo docker compose exec db psql -U annotinder -c "select key, count from rate_limits order by minute desc limit 5"
```

The `login:` line must show your own public address
(`curl -s https://ifconfig.me`), not one from Cloudflare's ranges. A setting
that makes the server read `CF-Connecting-IP` itself is proposed
(`plans/go-live.md`, P-02).

#### 5. What Cloudflare caches

By default Cloudflare caches by file extension (scripts, styles, images,
fonts) and does **not** cache pages (HTML) or JSON. That fits:

| Path | The server says | Cloudflare |
| --- | --- | --- |
| `/assets/*` (the client's scripts and styles; their names change with their content) | cache for a year | caches |
| `/`, `/code/...`, `/research/...` (all the same page, `index.html`) | nothing | does not cache |
| `/api/*` | nothing; downloads say `private, no-store` | does not cache |

Make that explicit, so a later change can't undo it: one Cache Rule,
"URI path starts with `/api/`" → **Bypass cache**. And never add a rule
that caches everything: a cached page or API answer would be shown to the
wrong person.

One thing to know: for a file under `/assets/` that doesn't exist (an old
name after an update, asked for by a tab that was left open), the server
answers with the app's page and the one-year cache header (checked with a
request to the server; `plans/go-live.md`, P-16). Cloudflare then keeps that wrong answer
for that name. It only matters if that name comes back, which happens when
you go back to an older version: **after going back to an older version,
purge the cache** (*Caching › Configuration › Purge Everything*).

#### 6. Settings to turn off

Cloudflare has features that change pages or stop visitors. The app's pages
only allow scripts from its own address (`security.md` §2), and its API is
called by programs.

| Setting | Why off |
| --- | --- |
| **Rocket Loader** (*Speed*) | Rewrites the page's scripts to load through Cloudflare's own: the page's security policy blocks that, and the app does not start |
| **Cloudflare Web Analytics / RUM** (often on by default on new Free zones) | Adds a measuring script to pages: blocked by the security policy, and the privacy statement says there are no analytics |
| **Email Address Obfuscation** (*Scrape Shield*) | Rewrites pages that contain addresses; nothing to gain here |
| **Bot Fight Mode** (*Security › Bots*) | Challenges programs: R and Python clients, the smoke test and uptime checks get a challenge page instead of JSON. On the Free plan no rule can exempt them |
| **Under Attack mode** | Only during an attack: every visitor waits at a check, and API clients fail |
| Zaraz, Apps, anything that "adds a snippet" | The same as analytics |

Leave on: the default DDoS protection, the free managed WAF rules (but see
8), HTTP/2 and HTTP/3, Brotli.

Features that challenge visitors set cookies of their own (`__cf_bm`,
`cf_clearance`), and so does Load Balancing with session affinity. Each one
you turn on goes into the privacy statement's cookie table
(`legal/privacy-statement.md` §5).

#### 7. Limits of the proxy

| Limit | Cloudflare (Free and Pro) | The server | What it means |
| --- | --- | --- | --- |
| Size of one request | **100 MB** (Business: 200 MB) | 256 MB for the researcher API (`/api/study/*`), 2 MB for coders, 1 MB for admin, 64 KB for account settings | A units upload or study import between 100 and 256 MB works on the lab's server and fails behind Cloudflare, with Cloudflare's own error page (413). Split the upload (P-10) |
| Time until the server starts answering | **100 to 120 seconds** (Cloudflare's pages give both numbers; only Enterprise can raise it). Then error 524 | None in the server or Caddy. Node's own default allows 5 minutes to receive one request | Affected: making the results download and exporting a study (both are built completely before the answer starts), importing a study, a very large upload or deploy. Fine for ordinary studies; measure with your largest one (P-13) |
| Size of a download | No limit for answers that aren't cached | None | Results downloads of any size pass |

The lab's server, with Caddy alone, has none of these limits.

#### 8. Attacks, the firewall and rate limiting

- **Floods (DDoS)**: stopped by Cloudflare on every plan, without settings,
  as long as step 3 holds.
- **The managed WAF rules** look for attack patterns in requests. Research
  material can look like one: a unit with HTML or SQL in it, a coder's
  answer that quotes code. If an upload or an answer is refused with a
  Cloudflare page, look in *Security › Events* and add an exception for
  `/api/` **(unverified how far the Free plan lets you)**.
- **Rate limiting**: the Free plan has one rule, counting per address over
  10 seconds, blocking for 10 seconds. Use it for the login: "URI path
  starts with `/api/auth/`", 20 requests per 10 seconds. The server's own
  limits (`security.md` §3) do the rest, which is why step 4 matters.
- A class or a lab behind one address is normal here: don't add rules that
  block an address for many requests to `/api/d/`.

#### 9. Turnstile

Turnstile is Cloudflare's "are you human" check: a small widget, free. Where
it would help, and where not:

| Where | Helps? |
| --- | --- |
| Researchers logging in or registering | Not here: that happens at the login provider, which needs its own protection against bots on its registration page |
| Starting a coder session on an open link (a crowd study without a panel) | Yes: it stops scripts from filling a study with sessions. Needs code: the widget, a check on the server, and a wider security policy for pages (P-05) |
| Panel studies | Little: the panel identifies participants, and its ids are checked by the researcher |
| The API for R and Python | No: programs can't pass it |

It is not built, and not needed to open the server. If it is added, the
widget is a script from Cloudflare in the coder's browser: the privacy
statement and the reasoning about the cookie banner must be looked at again.

## Does it need Redis or another key-value store?

No. The code was checked for everything such a store is usually for:

| Usually in Redis | In AnnoTinder |
| --- | --- |
| Sessions | Login sessions and coder sessions are rows in Postgres, found by an indexed hash |
| Rate limit counters | An `UNLOGGED` Postgres table (fast, not written to the log, emptied by a crash, which is fine for counters), shared by all processes. The flood limit for coders is counted in memory |
| A cache | In memory per process, and small: the deployed designs in use, a link's settings (a minute), results summaries (seconds) |
| Locks between processes | Postgres advisory locks, inside the transaction that needs them |
| Telling other processes that something changed | A revision number on the deployment, read with each request |
| Background jobs and queues | None: every request does its own work |
| Files | Results downloads on disk (`ANNOTINDER_FILES_DIR`); S3 is planned for several instances |

A second store would be a second thing to run, back up, secure and keep in
step with the database, for no gain at this size: 500 coders at once are
around a thousand small statements a second (an estimate from the code,
release plan B6-04), which Postgres on 4 cores handles
([Capacity](#capacity)). The two things
that are per process today (previews and results files) would move to
Postgres and to S3, not to Redis.

It would be worth another look only if the rate limit table showed up
among the database's slowest statements under load.

## With Docker Compose elsewhere

The same `compose.yml` works on any machine with Docker:

1. Copy `.env.example` to `.env` and fill it in ([Settings](#settings)).
2. Register AnnoTinder with your login provider ([Login provider](#login-provider)).
3. `ANNOTINDER_COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build`.

The app listens on `127.0.0.1:8787`. Put a TLS proxy in front that keeps the
`Host` header and sets `X-Forwarded-Proto` and `X-Forwarded-For` (Caddy's
block from step 7 does). The server takes the client's address from the last
entry of `X-Forwarded-For`: with a second proxy in front, see
[The visitor's real address](#4-the-visitors-real-address).

## Settings

Environment variables; an empty value counts as unset. `.env.example` lists
those for `compose.yml`.

| Variable | What |
| --- | --- |
| `ANNOTINDER_PUBLIC_URL` | Where browsers reach AnnoTinder, no trailing slash. The login callback is `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`; `https://` turns on HSTS |
| `ANNOTINDER_SECRET` | Signs login state, preview links and download links (`openssl rand -hex 32`); without it these end at every restart |
| `DATABASE_URL` | Postgres, e.g. `postgres://user:pass@host:5432/annotinder` (compose sets it). Without it: PGlite in `PGLITE_DIR` (development) |
| `OIDC_HOST`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | The login provider's issuer and client. Without them nobody can log in |
| `OIDC_MFA_CLAIM` | Which ID token claim is a second factor: `amr:mfa` (default) or `acr:<value>` (`security.md` §1) |
| `OIDC_ACCOUNT_URL` | The provider's account page for setting up a second factor; required unless `AUTH_INSECURE_DISABLE_2FA` |
| `OIDC_PREVIOUS_HOST`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_MFA_CLAIM`, `OIDC_PREVIOUS_UNTIL` | The previous provider while changing providers, until a date (`accounts.md`, "Changing providers") |
| `AUTH_STEP_UP_MAX_AGE` | Seconds a second factor stays fresh for sensitive actions (default 600) |
| `AUTH_INSECURE_DISABLE_2FA`, `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` | `true`: weaker security, for teaching and servers without sensitive data (`security.md` §1) |
| `ANNOTINDER_ADMINS` | Comma-separated addresses that get the admin role at login |
| `ANNOTINDER_TRUST_PROXY` | `1`: take the client's address (for rate limits) from the last entry of `X-Forwarded-For`. Only when the server is reachable only through the proxy (compose sets it) |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (e.g. a load test from one machine) |
| `ANNOTINDER_FRAME_ANCESTORS` | Origins (space or comma separated) that may frame AnnoTinder, e.g. `https://amcat.example.org` |
| `ANNOTINDER_COMMIT` | The commit recorded with each deployment; a build argument of the image |
| `POSTGRES_PASSWORD` | Compose only: the database password |
| `PORT` | Default 8787 |
| `HOST` | Where to listen. Default all addresses (development mode: localhost) |
| `PGPOOL_MAX` | Database connections per server process (default 20) |
| `PGLITE_DIR` | Without `DATABASE_URL`: the PGlite folder (default `packages/server/.pglite`) |
| `ANNOTINDER_CLIENT_DIR` | The built client (the image sets it) |
| `ANNOTINDER_FILES_DIR` | Where results downloads are kept (default: a folder in the temp folder; in the image that is inside the container, so it is emptied when the container is replaced). A cache: losing it only means the next download is written again. One file per study, replaced by the next download; it holds coders' answers, and is not removed when the study or a coder's data is deleted (`plans/go-live.md`, P-15) |
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
SURFconext. One provider per server (two only while moving from one to the
other).

The server depends on it: while the provider is down nobody can log in
(people who are logged in, and coders without sign-in, go on). **For a
public server** the provider is itself a public service: its registration
page is where bots arrive, it sends the mails to verify addresses and reset
passwords (AnnoTinder sends none), and someone must help people who lost a
second factor. The lab's `idp` realm can be that; SURFconext avoids running
accounts but leaves out researchers outside Dutch institutions.

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
share one database (`architecture.md` §3). What is per process, and what
breaks: [Several app instances: what works today](#several-app-instances-what-works-today).
Run one process until that list is dealt with.

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
with their own units and a link each. Coders arrive at ten a second.

It prints, and writes to `bench/<date>-<preset>-<database>.json` (with the
scenario, the commit and the machine): per kind of request the p50, p95,
p99 and highest latency and the requests per second, the errors, a probe
that calls `GET /api/health` every 100 ms (the server does nothing for it,
so a slow answer means the one server process was busy), and the server
process's memory and processor time. `SEED`, `DURATION`, `THINK_MS` and
`BATCH` override a preset. The run fails (exit 1) on an error, on a server
that stops, or over the preset's limits.

| Preset | Studies | Coders | Time per unit | Runs for | Limits |
| --- | --- | --- | --- | --- | --- |
| `smoke` | 3 (2,200 units) | 20 | 0.5 s | 20 s | no errors (for CI, on PGlite) |
| `pilot` | 5 (8,500 units) | 50 | 2 s | 90 s | no errors, submit p95 < 250 ms, next p95 < 500 ms, probe < 500 ms |
| `public` | 4 (32,000 units) | 500 | 10 s | 5 min | **the launch criteria**: no errors, submit p95 < 100 ms, next p95 < 250 ms, probe < 250 ms |
| `many-studies` | 50 (92,500 units) | 500 | 10 s | 5 min | the launch criteria |
| `stress` | 4 (42,000 units) | 500 | 1 s | 2 min | no errors (finds where it saturates) |
| `large-queue` | 1 shared queue of 50,000 units | 300 | 2 s | 3 min | no errors (what a long queue costs) |

`pnpm bench:seed` (`scripts/bench-seed.mjs`) makes a large existing data
set: studies and a few real coders through the API, then those coders
copied in SQL into many sessions with many finished units. It then times
the researcher's pages and exports on the first study, and a coder coming
back to their session. `STUDIES`, `UNITS`, `SESSIONS` and
`UNITS_PER_SESSION` set the shape; the default is 50 studies of 2,000 units
with a million answers in all.

`scripts/load-test.mjs` runs one scenario against a server that is already
running (`BASE`, `MODE=shared | all | experts`, `CODERS`, `UNITS`, ...).

### What was measured

On 24 November 2026, on a development container, **not on the VM**: 4
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

The same presets on **PGlite** (the database inside the server process,
one connection, in WebAssembly: development and tests) only show that
things work. Never read capacity from them:

| Preset, on PGlite | Units submitted per second | Next batch p50 / p95 / p99 | Submit p50 / p95 / p99 | Probe, highest | App: share of one core | App: memory at most | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `smoke` | 35.1 | 39 / 96 / 119 | 24 / 76 / 118 | 100 | 0.57 | 483 MB | 0 |
| `pilot` | 23.6 | 29 / 83 / 138 | 18 / 73 / 131 | 146 | 0.44 | 601 MB | 0 |

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

The runs were repeated on 25 November after the API's renames
(`bench/2026-11-25-*.json`), while other jobs kept the machine busy (the
later files' `machine.loadAverage`: 10 to 21 on 4 cores). Every preset still
ran without errors; at the launch workload the latencies were two to three
times higher, and `public` missed one launch criterion (the probe's highest answer: 343 ms). These
show that the scripts follow the API, not what the server can do.

### Sizing

Measured above: the app's processor share and memory under coding, the
database's size, the reads. **Extrapolated**: everything about the VM. The
database's memory was not measured (it ran with 128 MB of `shared_buffers`
and the machine's file cache), nor HTTPS and Caddy, nor an import of a
very large study, nor several server processes.

| | The lab pilot | The public server |
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
  Caddy.
- **Memory**: 8 GB for the public server is the app at its measured worst
  (2 GB; set Node's `--max-old-space-size` to what the container may use,
  3 GB), Postgres (2 GB) and the file cache. On the pilot's 4 GB the same
  read of a very large study would not fit: a pilot has no such study.
- **Disk** is for the dumps, not for the database: a few GB of database,
  and every kept dump again ([Backups](#backups)).
- `PGPOOL_MAX` (20) was enough at every load measured; Postgres'
  `max_connections` (100) is above it.
- Several server processes are not needed for capacity at this size
  ([Several server processes](#several-server-processes)).

### On the VM, before launch

The numbers above come from a shared development container with Postgres
16. On the real VM, with the release's image and Postgres 18:

1. `pnpm bench smoke`, then with `DATABASE_URL` pointing at an **empty
   database of its own** on the VM's Postgres (never the live one: the
   benchmark needs development auth and adds studies): `pnpm bench public`
   and `pnpm bench many-studies`. Both must pass the launch criteria.
2. `pnpm bench stress` and `pnpm bench large-queue`: where it saturates on
   this machine, and that nothing fails there.
3. `pnpm bench:seed`, and once with `STUDIES=1 UNITS=10000 SESSIONS=2000
   UNITS_PER_SESSION=250`: the reads on a large study, and the app's memory
   after them against the container's limit.
4. Keep the JSON files (`bench/`) and replace the tables above with them.

Better still, run the simulated coders from another machine
(`scripts/load-test.mjs` with `BASE`, against a server started for the
test with development auth on a private address): here they took part of
the 4 cores.
