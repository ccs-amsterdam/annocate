import { Hono } from "hono";
import { cors } from "hono/cors";
import type { DatabaseSync } from "node:sqlite";
import { CONTRACTS_VERSION } from "@annotinder/contracts";
import { JobTokenIssuer } from "./jobTokens.js";
import type { Env, Server } from "./context.js";
import { annotations } from "./annotator/annotations.js";
import { putCoder } from "./annotator/coders.$coderId.js";
import { resolveCoder } from "./annotator/coders.resolve.js";
import { listCoders } from "./annotator/coders.js";
import { getDeployment as getAnnotatorDeployment } from "./annotator/deployment.js";
import { listFinished } from "./annotator/finished.js";
import { requireJobToken } from "./annotator/requireJobToken.js";
import { requestJobToken } from "./annotator/token.js";
import { getUnits } from "./annotator/units.js";
import { annotationsReset } from "./researcher/annotations.reset.js";
import { codebook } from "./researcher/codebook.$id.js";
import { codebooks } from "./researcher/codebook.js";
import { coders } from "./researcher/coders.js";
import { deploymentPreview } from "./researcher/deployment.preview.js";
import { deploymentRefresh } from "./researcher/deployment.refresh.js";
import { deploymentStatus } from "./researcher/deployment.status.js";
import { deployment } from "./researcher/deployment.js";
import { inviteRevoke } from "./researcher/invites.$id.revoke.js";
import { invite } from "./researcher/invites.$id.js";
import { invites } from "./researcher/invites.js";
import { job } from "./researcher/job.$id.js";
import { jobUsers } from "./researcher/job.$id.users.js";
import { jobs } from "./researcher/job.js";
import { overview } from "./researcher/overview.js";
import { unit } from "./researcher/units.$id.js";
import { unitset } from "./researcher/unitsets.$id.js";
import { unitsets } from "./researcher/unitsets.js";
import { unitsFields } from "./researcher/units.fields.js";
import { unitsPage } from "./researcher/units.page.js";
import { units } from "./researcher/units.js";

export interface AppOptions {
  /** If set, deployments notify this job server, and deployment status is proxied from it. */
  jobServer?: { url: string; fetch?: typeof fetch };
  /**
   * Job tokens (plan §13): the secret they are signed with, and this db
   * server's own URL as job servers address it. JWKS are fetched with
   * `jobServer.fetch` if given. Defaults are for local development.
   */
  tokens?: { secret: string; publicUrl: string };
}

/**
 * Builds the full Hono app for a given (already-opened) database. Kept as a
 * factory so tests can pass in a fresh in-memory db per test.
 */
export function createApp(db: DatabaseSync, options: AppOptions = {}) {
  const tokens = options.tokens ?? { secret: "dev-token-secret", publicUrl: "http://localhost:8787" };
  const server: Server = {
    db,
    tokens: new JobTokenIssuer({ ...tokens, fetch: options.jobServer?.fetch }),
    publicUrl: tokens.publicUrl,
    jobServer: options.jobServer ?? null,
  };

  const app = new Hono<Env>();
  app.use("*", cors());
  app.get("/", (c) => c.json({ ok: true, contractsVersion: CONTRACTS_VERSION }));

  // Researcher API (researcher/): full paths, dev-only auth (researcher/auth.ts).
  // Order matters: units/fields and units/page before units/:id.
  app.route("/", jobs(server));
  app.route("/", job(server));
  app.route("/", jobUsers(server));
  app.route("/", codebooks(server));
  app.route("/", codebook(server));
  app.route("/", units(server));
  app.route("/", unitsFields(server));
  app.route("/", unitsPage(server));
  app.route("/", unit(server));
  app.route("/", unitsets(server));
  app.route("/", unitset(server));
  app.route("/", coders(server));
  app.route("/", invites(server));
  app.route("/", invite(server));
  app.route("/", inviteRevoke(server));
  app.route("/", overview(server));
  app.route("/", deployment(server));
  app.route("/", deploymentStatus(server));
  app.route("/", deploymentRefresh(server));
  app.route("/", deploymentPreview(server));
  app.route("/", annotationsReset(server));

  // Annotator API (annotator/), called by the job server only. The token
  // route runs without a job token; every other route requires one.
  const prefix = "/annotator/job/:jobId";
  app.route(`${prefix}/token`, requestJobToken(server));
  app.use(`${prefix}/*`, requireJobToken(server));
  app.route(`${prefix}/deployment`, getAnnotatorDeployment(server));
  app.route(`${prefix}/units`, getUnits(server));
  app.route(`${prefix}/coders`, listCoders(server));
  app.route(`${prefix}/coders/resolve`, resolveCoder(server));
  app.route(`${prefix}/coders/:coderId`, putCoder(server));
  app.route(`${prefix}/finished`, listFinished(server));
  app.route(`${prefix}/annotations`, annotations(server));

  return app;
}
