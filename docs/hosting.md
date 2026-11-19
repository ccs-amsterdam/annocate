# Hosting

AnnoTinder is one Node server that also serves the built client (one origin:
session cookies), and a Postgres database. `Dockerfile` builds the server
and client into one image; `docker-compose.yml` runs it with Postgres.

## With Docker Compose

1. Copy `.env.example` to `.env` and fill it in (below).
2. Register AnnoTinder with your login provider (below).
3. `docker compose up -d --build`

The app then listens on `127.0.0.1:8787`: put it behind a proxy that does
TLS and forwards to it (keeping the `Host` and setting `X-Forwarded-Proto`),
or use the `tls` profile, which adds Caddy with a Let's Encrypt
certificate for `ANNOTINDER_DOMAIN` (ports 80 and 443 must reach the
machine):

```
docker compose --profile tls up -d --build
```

The database schema is created and updated when the server starts: the
server applies the migrations in `packages/server/migrations` that the
database doesn't have yet (recorded in its `drizzle` schema), in order and
under a lock, so several server processes can start at once. A database
from an earlier release is updated in place. (Before the first release the
migrations were reset to a new start, made by Drizzle: a test server from
before 2026-11-19 has to start with a new database.)

**Changing the schema** (development): edit the tables in
`packages/server/src/db/schema/`, then run

```
pnpm --filter @annotinder/server db:generate
```

It writes a new migration (SQL, plus its snapshot in `migrations/meta/`)
from the difference with the last one. Read it and commit it with the
change; the next server start applies it. An applied migration is never
edited. `packages/server/README.md` has the details.

`GET /api/health` answers `{ ok: true, service, release, commit }` when the
server runs (the image's health check uses it).

**Versions.** Each deployment records the release and commit it ran on
(the deploy history, and `design.json` in the results export), so a study
says exactly what coders' screens were. The release is in the code; the
commit comes from `ANNOTINDER_COMMIT`, which the image takes as a build
argument. Build with it:

```
ANNOTINDER_COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build
```

Without it the commit is recorded as "unknown" (a server run from a git
checkout finds it itself).

## Settings

| Variable | What |
| --- | --- |
| `ANNOTINDER_PUBLIC_URL` | Where browsers reach AnnoTinder, e.g. `https://annotinder.example.org` (no trailing slash). The login callback is `<ANNOTINDER_PUBLIC_URL>/api/auth/callback` |
| `ANNOTINDER_SECRET` | Signs login state and preview links. A long random string (`openssl rand -base64 48`); without it these end with every restart |
| `DATABASE_URL` | Postgres, e.g. `postgres://user:pass@host:5432/annotinder`. The compose file sets it from `POSTGRES_PASSWORD`. Without it the server uses PGlite in `PGLITE_DIR` (development) |
| `OIDC_HOST`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Researcher login (below): the provider's issuer, the client ID and secret. Without them nobody can log in |
| `OIDC_MFA_CLAIM` | Which ID token claim counts as a second factor: `amr:mfa` (default) or `acr:<value>`. `security.md` §1 |
| `OIDC_PREVIOUS_HOST`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_MFA_CLAIM`, `OIDC_PREVIOUS_UNTIL` | While moving to another login provider: the previous one, accepted until `OIDC_PREVIOUS_UNTIL` (a date) so users can link their new login. `accounts.md` "Changing providers" |
| `AUTH_STEP_UP_MAX_AGE` | Seconds a login's second factor stays fresh for sensitive actions (default 600). `security.md` §1 |
| `ANNOTINDER_ADMINS` | Comma-separated emails that get the admin role when they log in: the server's first admins (`accounts.md`) |
| `ANNOTINDER_TRUST_PROXY` | `1`: behind a proxy (Caddy, nginx) that sets `X-Forwarded-For`: rate limits count the client's address from it. Only when the server can't be reached except through the proxy |
| `ANNOTINDER_RATE_LIMITS` | `off`: no rate limits (e.g. for a load test from one machine). On by default (`security.md`) |
| `ANNOTINDER_FRAME_ANCESTORS` | Origins (space or comma separated) that may show AnnoTinder in a frame besides itself, e.g. AmCAT's `https://amcat.example.org` |
| `POSTGRES_PASSWORD` | Compose only: the database password |
| `ANNOTINDER_DOMAIN` | Compose `tls` profile only: the domain Caddy gets a certificate for |
| `PORT` | Default 8787 |
| `HOST` | Where to listen; default all addresses (in development mode: localhost) |
| `PGPOOL_MAX` | Database connections per server process (default 20) |
| `PGLITE_DIR` | Without `DATABASE_URL`: where the PGlite database lives (development; default `.pglite` in `packages/server`) |
| `ANNOTINDER_CLIENT_DIR` | The built client; set in the image |
| `ANNOTINDER_DEMO` | `1`: an empty database gets the demo study. Development only |
| `AUTH_DEV_MODE` | `1`: development auth headers instead of a login. The server refuses to start unless it listens on localhost only. **Never for a server other people use** |

## Login provider

Researchers (and coders whose link asks for it) log in with an OpenID
Connect provider: Zitadel, Authentik, Keycloak, or a hosted one (Google,
Microsoft).

- Register a confidential web client with redirect URI
  `<ANNOTINDER_PUBLIC_URL>/api/auth/callback`, scope `openid email`.
- The provider must meet the lab's Authentication standard (`security.md`
  §1): verified email addresses (`email_verified: true`), a second factor
  it signals in the ID token (`OIDC_MFA_CLAIM`), and step-up (`max_age`,
  `auth_time`). Researcher access always needs the second factor.
- Users are their login at the provider (`iss` + `sub`), not their email
  address. To move to another provider, keep the old one for a while
  (`OIDC_PREVIOUS_*`) so users link their new login, or have users
  re-claim their account by email (`pnpm --filter @annotinder/server
  identities reset --yes`): `accounts.md` "Changing providers".

Security settings (second factor, headers, rate limits, framing):
`security.md`.

## Backups

The data is the Postgres database:

```
docker compose exec db pg_dump -U annotinder annotinder | gzip > annotinder-$(date +%F).sql.gz
```

## Updating

```
git pull
docker compose up -d --build
```

## Several server processes

The server keeps only each live study's deployment (codebook, sets,
settings) in memory, so several
processes can share one database (`architecture.md` §3), e.g. compose
replicas behind a proxy. Exceptions: researcher previews live in one
process's memory, and a study's limit on answers is counted per process.

## Capacity

`packages/server/scripts/load-test.mjs` simulates coders on one study. On a
4-core machine with Postgres 17 in Docker, one server process, a study of
10,000 units in a shared queue (until 2 coders, at most 2), batches of 5
units:

| Coders | Time per unit | Next batch p50 / p99 | Submit p50 / p99 |
| --- | --- | --- | --- |
| 300 | ~10 s (realistic) | 26 / 79 ms | 10 / 31 ms |
| 300 | ~1 s (stress) | 8.9 s / 16.8 s | 32 / 87 ms |

No unit was coded by more than its `maxCoders`. A shared queue hands out
units one pick at a time (it holds a lock while it decides), and a pick
reads the queue's codings: about 25 picks per second at 10k units and
~12k codings, fewer as codings grow (`architecture.md` §11, item 11). That is
far more than coders at a realistic pace need (300 coders at 10 s per unit
and batches of 5: 6 picks per second); studies without a shared queue
don't take that lock.
