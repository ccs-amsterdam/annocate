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
import { backendRoutes } from "./routes/backend.js";
import { deploymentRoutes, type JobServerLink } from "./routes/deployment.js";

export interface AppOptions {
  /** Shared secret the job server uses for the backend API. */
  backendSecret?: string;
  /** If set, deployments notify this job server, and deployment status is proxied from it. */
  jobServer?: JobServerLink;
}

export const DEV_BACKEND_SECRET = "dev-job-server-secret";

/** Builds the full Hono app for a given (already-migrated) database. Kept as
 * a factory so tests can pass in a fresh in-memory db per test. */
export function createApp(db: DatabaseSync, options: AppOptions = {}) {
  const app = new Hono<HonoEnv>();

  app.use("*", cors());

  app.get("/", (c) => c.json({ ok: true, contractsVersion: CONTRACTS_VERSION }));

  app.route("/", jobRoutes(db));
  app.route("/job/:jobId", codebookRoutes(db));
  app.route("/job/:jobId", unitRoutes(db));
  app.route("/job/:jobId", unitsetRoutes(db));
  app.route("/job/:jobId", coderRoutes(db));
  app.route("/job/:jobId", deploymentRoutes(db, options.jobServer));

  // Called by the job server only (docs/architecture.md).
  app.route("/backend/job/:jobId", backendRoutes(db, options.backendSecret ?? DEV_BACKEND_SECRET));

  // Legacy: coders talking to the db server directly. Superseded by the job
  // server; kept until the admin preview runs through the job server too.
  app.route("/", sessionRoutes(db));

  return app;
}
