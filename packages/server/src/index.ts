import { serve } from "@hono/node-server";
import { studies } from "./db/schema/index.js";
import { describeDatabase, openDatabase } from "./database.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
import { parseMfaClaim, type MfaClaim } from "./oidc.js";

// Node entry point. PORT (default 8787); HOST (where to listen; default all
// addresses, in development mode localhost only); DATABASE_URL (Postgres),
// or else PGLITE_DIR (a local PGlite database, default .pglite in this
// package); ANNOTINDER_SECRET (signs login state and preview tokens; random
// per process if not set); ANNOTINDER_CLIENT_DIR (the built client, served
// from this server); ANNOTINDER_DEMO=1 (an empty database gets the demo
// study: development). docs/hosting.md has the full list.
//
// Researcher login, as in the lab's Authentication standard (docs/security.md):
// OIDC_HOST (the provider's issuer), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
// OIDC_MFA_CLAIM (amr:mfa, default, or acr:<value>), AUTH_STEP_UP_MAX_AGE
// (seconds, default 600), and during a move to another provider
// OIDC_PREVIOUS_HOST, OIDC_PREVIOUS_CLIENT_ID, OIDC_PREVIOUS_CLIENT_SECRET,
// OIDC_PREVIOUS_MFA_CLAIM, OIDC_PREVIOUS_UNTIL; AUTH_DEV_MODE=1 (development
// headers instead of a login: refused unless the server listens on localhost
// only); ANNOTINDER_PUBLIC_URL (where browsers reach the server);
// ANNOTINDER_ADMINS (comma-separated emails: the server's first admins);
// ANNOTINDER_FRAME_ANCESTORS (origins that may frame AnnoTinder, e.g. AmCAT's);
// ANNOTINDER_TRUST_PROXY=1 (behind a proxy: client addresses from X-Forwarded-For);
// ANNOTINDER_RATE_LIMITS=off (no rate limits; docs/security.md).

const port = Number(process.env.PORT ?? 8787);
const devMode = process.env.AUTH_DEV_MODE === "1";
// Development mode only on this machine: never on a server other people reach.
const LOOPBACK = ["localhost", "127.0.0.1", "::1"];
const host = process.env.HOST?.trim() || (devMode ? "localhost" : undefined);
if (devMode && !LOOPBACK.includes(host ?? "")) {
  throw new Error(
    `AUTH_DEV_MODE needs the server to listen on localhost only (HOST=${host ?? "all addresses"}): development mode is never for a server other people use`,
  );
}

const db = await openDatabase();
// Development: an empty database gets a demo study.
if (process.env.ANNOTINDER_DEMO === "1" && (await db.$count(studies)) === 0) await seed(db);

const { OIDC_HOST, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, ANNOTINDER_PUBLIC_URL } = process.env;
// Moving to another provider: the previous one, accepted until OIDC_PREVIOUS_UNTIL (docs/accounts.md "Changing providers")
const { OIDC_PREVIOUS_HOST, OIDC_PREVIOUS_CLIENT_ID, OIDC_PREVIOUS_CLIENT_SECRET, OIDC_PREVIOUS_UNTIL } = process.env;
let previous:
  { oidc: { issuer: string; clientId: string; clientSecret: string; mfaClaim: MfaClaim }; until: Date } | undefined;
if (OIDC_PREVIOUS_HOST) {
  const until = new Date(OIDC_PREVIOUS_UNTIL ?? "");
  if (!OIDC_PREVIOUS_CLIENT_ID || !OIDC_PREVIOUS_CLIENT_SECRET || Number.isNaN(until.getTime())) {
    throw new Error(
      "OIDC_PREVIOUS_HOST needs OIDC_PREVIOUS_CLIENT_ID, OIDC_PREVIOUS_CLIENT_SECRET and OIDC_PREVIOUS_UNTIL (a date)",
    );
  }
  previous = {
    oidc: {
      issuer: OIDC_PREVIOUS_HOST,
      clientId: OIDC_PREVIOUS_CLIENT_ID,
      clientSecret: OIDC_PREVIOUS_CLIENT_SECRET,
      mfaClaim: parseMfaClaim(process.env.OIDC_PREVIOUS_MFA_CLAIM),
    },
    until,
  };
}
const login =
  OIDC_HOST && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET
    ? {
        oidc: {
          issuer: OIDC_HOST,
          clientId: OIDC_CLIENT_ID,
          clientSecret: OIDC_CLIENT_SECRET,
          mfaClaim: parseMfaClaim(process.env.OIDC_MFA_CLAIM),
        },
        publicUrl: ANNOTINDER_PUBLIC_URL || `http://localhost:${port}`,
        ...(previous ? { previous } : {}),
      }
    : undefined;
if (login && !process.env.ANNOTINDER_SECRET) {
  console.warn("ANNOTINDER_SECRET is not set: logins in progress and previews end with a restart");
}
const stepUpMaxAge = Number(process.env.AUTH_STEP_UP_MAX_AGE ?? 600);
if (!Number.isInteger(stepUpMaxAge) || stepUpMaxAge <= 0)
  throw new Error("AUTH_STEP_UP_MAX_AGE must be a number of seconds");
const admins = (process.env.ANNOTINDER_ADMINS ?? "").split(",");
const clientDir = process.env.ANNOTINDER_CLIENT_DIR || undefined;
const frameAncestors = (process.env.ANNOTINDER_FRAME_ANCESTORS ?? "").split(/[\s,]+/).filter(Boolean);
const https = ANNOTINDER_PUBLIC_URL?.startsWith("https://") ?? false;
// Rate limits: on unless ANNOTINDER_RATE_LIMITS=off (e.g. a load test from one machine)
const rateLimits = process.env.ANNOTINDER_RATE_LIMITS === "off" ? undefined : {};
const trustProxy = process.env.ANNOTINDER_TRUST_PROXY === "1";
const app = createApp(db, {
  // An empty value counts as unset (a random secret), never as an empty signing key
  secret: process.env.ANNOTINDER_SECRET || undefined,
  devMode,
  login,
  admins,
  stepUpMaxAge,
  clientDir,
  frameAncestors,
  https,
  rateLimits,
  trustProxy,
});

const server = serve({ fetch: app.fetch, port, ...(host ? { hostname: host } : {}) }, (info) => {
  console.log(`@annotinder/server listening on http://localhost:${info.port} (${describeDatabase()})`);
  console.log(
    login
      ? `  researcher login: ${login.oidc.issuer} (second factor: ${process.env.OIDC_MFA_CLAIM ?? "amr:mfa"}), callback ${login.publicUrl}/api/auth/callback`
      : "  researcher login: not configured (OIDC_HOST)",
  );
  console.log(`  admins: ${admins.filter((a) => a.trim()).join(", ") || "none named (ANNOTINDER_ADMINS)"}`);
  console.log(
    clientDir
      ? `  client: ${clientDir}`
      : "  client: not served here (ANNOTINDER_CLIENT_DIR; in development Vite serves it)",
  );
  if (devMode)
    console.warn(`  development mode (AUTH_DEV_MODE=1): development auth headers accepted, listening on ${host} only`);
});

const shutdown = () => {
  server.close(() => void db.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
