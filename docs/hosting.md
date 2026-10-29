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

The database schema is created and updated when the server starts
(`packages/server/migrations`). Until the first release the migrations may
be reset: a test server's data then has to be thrown away.

`GET /health` answers `{ ok: true }` when the server runs (the image's
health check uses it).

## Settings

| Variable | What |
| --- | --- |
| `ANNOTINDER_PUBLIC_URL` | Where browsers reach AnnoTinder, e.g. `https://annotinder.example.org` (no trailing slash). The login callback is `<ANNOTINDER_PUBLIC_URL>/auth/callback` |
| `ANNOTINDER_SECRET` | Signs login state and preview links. A long random string (`openssl rand -base64 48`); without it these end with every restart |
| `DATABASE_URL` | Postgres, e.g. `postgres://user:pass@host:5432/annotinder`. The compose file sets it from `POSTGRES_PASSWORD`. Without it the server uses PGlite in `PGLITE_DIR` (development) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Researcher login (below). Without them nobody can log in |
| `ANNOTINDER_ADMINS` | Comma-separated emails that get the admin role when they log in: the server's first admins (`accounts.md`) |
| `ANNOTINDER_REQUIRE_MFA` | `1`: researcher access needs a login with a second factor, as the provider reports it (`amr`). Recommended |
| `PORT` | Default 8787 |
| `ANNOTINDER_CLIENT_DIR` | The built client; set in the image |
| `ANNOTINDER_DEMO` | `1`: an empty database gets the demo job. Development only |
| `ANNOTINDER_DEV_AUTH` | `1`: accept development auth headers. **Never on a reachable server** |

## Login provider

Researchers (and coders whose invitation asks for it) log in with an OpenID
Connect provider: Zitadel, Authentik, Keycloak, or a hosted one (Google,
Microsoft).

- Register a confidential web client with redirect URI
  `<ANNOTINDER_PUBLIC_URL>/auth/callback`, scope `openid email`.
- The provider must verify email addresses: AnnoTinder keys accounts on the
  email and refuses a login without `email_verified: true`.
- For `ANNOTINDER_REQUIRE_MFA`, the provider must report the second factor
  in the ID token's `amr` claim (e.g. `mfa`, `otp`, `hwk`, `swk`; RFC 8176).

`plan-passkeys.md` has the plan for a second factor checked by AnnoTinder
itself.

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

The server keeps only the codebook of each live job in memory, so several
processes can share one database (`architecture.md` §3), e.g. compose
replicas behind a proxy. Exceptions: researcher previews live in one
process's memory, and a job's limit on answers is counted per process.
