import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { describeConfig, readConfig } from "./config.js";
import { describeDatabase, openDatabase } from "./database.js";
import { studies } from "./db/schema/index.js";
import { seed } from "./seed.js";
import { DiskFileStore } from "./shared/files.js";
import { sweepExpiredSessions } from "./shared/sessions.js";

// Node entry point: the settings (config.ts), the database, the app.

const config = readConfig(process.env);
const { port, host, demo, filesDir, ...options } = config;

const db = await openDatabase();
// Development: an empty database gets a demo study.
if (demo && (await db.$count(studies)) === 0) await seed(db);

const app = createApp(db, { ...options, files: new DiskFileStore(filesDir), log: console.log });

const server = serve({ fetch: app.fetch, port, ...(host ? { hostname: host } : {}) }, (info) => {
  console.log(`@annotinder/server listening on http://localhost:${info.port} (${describeDatabase()})`);
  const { lines, warnings } = describeConfig(config);
  for (const line of lines) console.log(`  ${line}`);
  for (const warning of warnings) console.warn(`  WARNING: ${warning}`);
});

const stopSweeping = sweepExpiredSessions(db, config.loginLimits);

const shutdown = () => {
  stopSweeping();
  server.close(() => void db.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
