import type { TwoFactorMode } from "@annotinder/contracts";
import { serve } from "@hono/node-server";
import { one } from "./db.js";
import { describeDatabase, openDatabase } from "./database.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";

// Node entry point. PORT (default 8787); DATABASE_URL (Postgres), or else
// PGLITE_DIR (a local PGlite database, default .pglite in this package);
// ANNOTINDER_SECRET (signs login state and preview tokens; random per process if not set);
// ANNOTINDER_CLIENT_DIR (the built client, served from this server);
// ANNOTINDER_DEMO=1 (an empty database gets the demo job: development);
// ANNOTINDER_DEV_AUTH=1 (accept development auth headers: local only);
// docs/hosting.md has the full list.
// researcher login: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
// ANNOTINDER_PUBLIC_URL (where browsers reach the server);
// ANNOTINDER_ADMINS (comma-separated emails: the server's first admins);
// ANNOTINDER_2FA=none|annotinder|oidc (who checks researchers' second factor:
//   nobody, AnnoTinder with passkeys, or the login provider; docs/security.md);
// ANNOTINDER_FRAME_ANCESTORS (origins that may frame AnnoTinder, e.g. AmCAT's);
// ANNOTINDER_TRUST_PROXY=1 (behind a proxy: client addresses from X-Forwarded-For);
// ANNOTINDER_RATE_LIMITS=off (no rate limits; docs/security.md).

const port = Number(process.env.PORT ?? 8787);
const db = await openDatabase();
// Development: an empty database gets a demo job.
if (process.env.ANNOTINDER_DEMO === "1" && !(await one(db, "SELECT 1 FROM jobs LIMIT 1"))) await seed(db);

const devAuth = process.env.ANNOTINDER_DEV_AUTH === "1";
const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, ANNOTINDER_PUBLIC_URL } = process.env;
const login =
  OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET
    ? {
        oidc: {
          issuer: OIDC_ISSUER,
          clientId: OIDC_CLIENT_ID,
          clientSecret: OIDC_CLIENT_SECRET,
        },
        publicUrl: ANNOTINDER_PUBLIC_URL ?? `http://localhost:${port}`,
      }
    : undefined;
if (login && !process.env.ANNOTINDER_SECRET) {
  console.warn("ANNOTINDER_SECRET is not set: logins in progress and previews end with a restart");
}
const admins = (process.env.ANNOTINDER_ADMINS ?? "").split(",");
const twoFactor = (process.env.ANNOTINDER_2FA ?? "none") as TwoFactorMode;
if (!["none", "annotinder", "oidc"].includes(twoFactor)) throw new Error("ANNOTINDER_2FA must be none, annotinder or oidc");
const clientDir = process.env.ANNOTINDER_CLIENT_DIR || undefined;
const frameAncestors = (process.env.ANNOTINDER_FRAME_ANCESTORS ?? "").split(/[\s,]+/).filter(Boolean);
const https = ANNOTINDER_PUBLIC_URL?.startsWith("https://") ?? false;
// Rate limits: on unless ANNOTINDER_RATE_LIMITS=off (e.g. a load test from one machine)
const rateLimits = process.env.ANNOTINDER_RATE_LIMITS === "off" ? undefined : {};
const trustProxy = process.env.ANNOTINDER_TRUST_PROXY === "1";
const app = createApp(db, {
  secret: process.env.ANNOTINDER_SECRET,
  devAuth,
  login,
  admins,
  twoFactor,
  clientDir,
  frameAncestors,
  https,
  rateLimits,
  trustProxy,
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/server listening on http://localhost:${info.port} (${describeDatabase()})`);
  console.log(login ? `  researcher login: ${login.oidc.issuer}, callback ${login.publicUrl}/auth/callback` : "  researcher login: not configured (OIDC_ISSUER)");
  console.log(`  admins: ${admins.filter((a) => a.trim()).join(", ") || "none named (ANNOTINDER_ADMINS)"}; second factor for researchers: ${{ none: "not required", annotinder: "a passkey (AnnoTinder)", oidc: "from the login provider" }[twoFactor]}`);
  console.log(clientDir ? `  client: ${clientDir}` : "  client: not served here (ANNOTINDER_CLIENT_DIR; in development Vite serves it)");
  if (devAuth) console.warn("  development auth headers accepted (ANNOTINDER_DEV_AUTH=1): never on a reachable server");
});

const shutdown = () => {
  server.close(() => void db.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
