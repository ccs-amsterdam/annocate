import { serve } from "@hono/node-server";
import { createDb } from "./db/schema.js";
import { seed } from "./db/seed.js";
import { createApp } from "./app.js";

const dbPath = process.env.DB_PATH ?? "./mock-server.sqlite";
const db = createDb(dbPath);

// Convenience for local dev: if the db has no job yet, seed a demo one.
const hasJob = db.prepare("SELECT 1 FROM jobs LIMIT 1").get();
if (!hasJob) seed(db);

const app = createApp(db);

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/mock-server listening on http://localhost:${info.port}`);
});
