import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createDb } from "./db/schema.js";
import { seed } from "./db/seed.js";
import { createApp, DEV_BACKEND_SECRET } from "./app.js";

const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), "../mock-server.sqlite");
const dbPath = process.env.DB_PATH ?? defaultPath;
const db = createDb(dbPath);

// Convenience for local dev: if the db has no job yet, seed a demo one.
const hasJob = db.prepare("SELECT 1 FROM jobs LIMIT 1").get();
if (!hasJob) seed(db);

const secret = process.env.JOB_SERVER_SECRET ?? DEV_BACKEND_SECRET;
const app = createApp(db, {
  backendSecret: secret,
  jobServer: {
    url: process.env.JOB_SERVER_URL ?? "http://localhost:8788",
    backendName: process.env.BACKEND_NAME ?? "mock",
    secret,
  },
  tokens: {
    secret: process.env.TOKEN_SECRET ?? "dev-token-secret",
    publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  },
});

const port = Number(process.env.PORT ?? 8787);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/mock-server listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
