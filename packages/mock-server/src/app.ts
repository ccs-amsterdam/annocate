import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DatabaseSync } from "node:sqlite";
import { CONTRACTS_VERSION } from "@annotinder/contracts";
import type { HonoEnv } from "./honoEnv.js";
import { jobRoutes } from "./routes/job.js";
import { codebookRoutes } from "./routes/codebook.js";
import { unitRoutes } from "./routes/units.js";
import { unitsetRoutes } from "./routes/unitsets.js";
import { sessionRoutes } from "./routes/session.js";
import { coderRoutes } from "./routes/coders.js";

/** Builds the full Hono app for a given (already-migrated) database. Kept as
 * a factory so tests can pass in a fresh in-memory db per test. */
export function createApp(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.use("*", cors());

  app.get("/", (c) => c.json({ ok: true, contractsVersion: CONTRACTS_VERSION }));

  app.route("/", jobRoutes(db));
  app.route("/job/:jobId", codebookRoutes(db));
  app.route("/job/:jobId", unitRoutes(db));
  app.route("/job/:jobId", unitsetRoutes(db));
  app.route("/", sessionRoutes(db));
  app.route("/job/:jobId", coderRoutes(db));

  return app;
}
