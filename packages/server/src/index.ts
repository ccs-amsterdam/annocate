import { serve } from "@hono/node-server";
import { one } from "./db.js";
import { describeDatabase, openDatabase } from "./database.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";

// Node entry point. PORT (default 8787); DATABASE_URL (Postgres), or else
// PGLITE_DIR (a local PGlite database, default .pglite in this package);
// ANNOTINDER_SECRET (signs preview tokens; random per process if not set);
// ANNOTINDER_DEV_AUTH=1 (accept development auth headers: local only).

const port = Number(process.env.PORT ?? 8787);
const db = await openDatabase();
// Convenience for local dev: if the database has no job yet, seed a demo one.
if (!(await one(db, "SELECT 1 FROM jobs LIMIT 1"))) await seed(db);

const devAuth = process.env.ANNOTINDER_DEV_AUTH === "1";
const app = createApp(db, { secret: process.env.ANNOTINDER_SECRET, devAuth });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/server listening on http://localhost:${info.port} (${describeDatabase()})`);
  if (devAuth) console.warn("  development auth headers accepted (ANNOTINDER_DEV_AUTH=1): never on a reachable server");
});

const shutdown = () => {
  server.close(() => void db.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
