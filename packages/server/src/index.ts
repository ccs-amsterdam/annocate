import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { openDb } from "./db.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";

// Node entry point. PORT (default 8787), DB_PATH (default
// annotinder.sqlite next to the package), ANNOTINDER_SECRET (signs preview
// tokens; random per process if not set).

const port = Number(process.env.PORT ?? 8787);
const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), "../annotinder.sqlite");
const db = openDb(process.env.DB_PATH ?? defaultPath);
// Convenience for local dev: if the db has no job yet, seed a demo one.
if (!db.prepare("SELECT 1 FROM jobs LIMIT 1").get()) seed(db);

const app = createApp(db, { secret: process.env.ANNOTINDER_SECRET });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/server listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
