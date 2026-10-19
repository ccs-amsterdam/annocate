import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DatabaseSync } from "node:sqlite";
import { CONTRACTS_VERSION } from "@annotinder/contracts";
import type { HonoEnv } from "./honoEnv.js";
import { jobRoutes } from "./routes/job.js";
import { codebookRoutes } from "./routes/codebook.js";
import { unitRoutes } from "./routes/units.js";
import { unitsetRoutes } from "./routes/unitsets.js";
import { coderRoutes } from "./routes/coders.js";
import { annotatorRoutes } from "./routes/annotator.js";
import { deploymentRoutes, type JobServerLink } from "./routes/deployment.js";
import { JobTokenIssuer } from "@annotinder/reference-db-server/jobTokens";

export interface AppOptions {
  /** If set, deployments notify this job server, and deployment status is proxied from it. */
  jobServer?: JobServerLink;
  /**
   * Job tokens (plan §13): the secret they are signed with, and this db
   * server's own URL as job servers address it. JWKS are fetched with
   * `jobServer.fetch` if given. Defaults are for local development.
   */
  tokens?: { secret: string; publicUrl: string };
}

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
  const tokens = options.tokens ?? { secret: "dev-token-secret", publicUrl: "http://localhost:8787" };
  const issuer = new JobTokenIssuer({ ...tokens, fetch: options.jobServer?.fetch });
  app.route("/job/:jobId", deploymentRoutes(db, issuer, tokens.publicUrl, options.jobServer));

  // Called by the job server only (docs/architecture.md).
  app.route("/annotator/job/:jobId", annotatorRoutes(db, issuer, options.jobServer?.url ?? null));

  // Legacy: coders talking to the db server directly. Superseded by the job
  // server; kept until the admin preview runs through the job server too.

  return app;
}
