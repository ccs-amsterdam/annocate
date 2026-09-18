import { Hono } from "hono";
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

  app.get("/", (c) => c.json({ ok: true, contractsVersion: CONTRACTS_VERSION }));

  app.route("/", jobRoutes(db));
  app.route("/", codebookRoutes(db));
  app.route("/", unitRoutes(db));
  app.route("/", unitsetRoutes(db));
  app.route("/", sessionRoutes(db));
  app.route("/", coderRoutes(db));

  return app;
}
