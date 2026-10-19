import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";
import { serve } from "@hono/node-server";
import { ConformanceFixtureSchema } from "@annotinder/contracts";
import { openDb } from "./db.js";
import { seed } from "./seed.js";
import { loadFixture } from "./fixture.js";
import { createApp } from "./app.js";

const jobServerUrl = process.env.JOB_SERVER_URL ?? "http://localhost:8788";
const port = Number(process.env.PORT ?? 8787);

// FIXTURE=<path to a conformance fixture>: a fresh in-memory db holding only that job.
let db;
if (process.env.FIXTURE) {
  const fixture = ConformanceFixtureSchema.parse(JSON.parse(fs.readFileSync(process.env.FIXTURE, "utf8")));
  db = openDb(":memory:");
  loadFixture(db, fixture, jobServerUrl);
} else {
  const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), "../reference-db.sqlite");
  db = openDb(process.env.DB_PATH ?? defaultPath);
  // Convenience for local dev: if the db has no job yet, seed a demo one.
  if (!db.prepare("SELECT 1 FROM jobs LIMIT 1").get()) seed(db);
}

const app = createApp(db, {
  jobServer: { url: jobServerUrl },
  tokens: {
    secret: process.env.TOKEN_SECRET ?? "dev-token-secret",
    publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  },
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@annotinder/reference-db-server listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
