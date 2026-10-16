import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  DeploymentWriteSchema,
  RefreshDeploymentSchema,
  ResetAnnotationsSchema,
  jobServerAdminEndpoints,
  JOB_SERVER_SIGNATURE_HEADER,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";
import { boundJobServer, getDeployment, putDeployment } from "../db/deployments.js";
import type { JobTokenIssuer } from "@annotinder/reference-db-server/jobTokens";
import { retireAnnotations } from "../db/annotations.js";

/** Where this db server's jobs are deployed, and how the job server knows this db server. */
export interface JobServerLink {
  url: string;
  fetch?: typeof fetch;
}

const PREVIEW_TTL_MS = 12 * 60 * 60_000;

export function deploymentRoutes(db: DatabaseSync, issuer: JobTokenIssuer, publicUrl: string, jobServer?: JobServerLink) {
  const app = new Hono<HonoEnv>();
  // Job servers know a job by this db server's host and the job id (plan §13).
  const deploymentId = (jobId: number) => `${new URL(publicUrl).host}/${jobId}`;

  // Calls to the job server the job is bound to, signed with the job's call
  // key (contracts JOB_SERVER_SIGNATURE_HEADER).
  const callJobServer = (path: string, method: "GET" | "POST", jobId: number, body?: unknown) => {
    const bound = jobServer ? boundJobServer(db, jobId, jobServer.url) : null;
    if (!jobServer || !bound) return Promise.resolve(null);
    const fullPath = path.replace(":deploymentId", deploymentId(jobId));
    const text = body === undefined ? "" : JSON.stringify(body);
    const headers: Record<string, string> = { [JOB_SERVER_SIGNATURE_HEADER]: issuer.signCall(bound, jobId, method, fullPath, text) };
    if (body !== undefined) headers["content-type"] = "application/json";
    return (jobServer.fetch ?? fetch)(bound + fullPath, { method, headers, body: body === undefined ? undefined : text });
  };

  app.get("/deployment", requireJobUser(db, "READ"), (c) => c.json(getDeployment(db, c.get("jobId"))));

  app.put("/deployment", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = DeploymentWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    if (!db.prepare("SELECT 1 FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, parsed.data.codebookId)) {
      return c.json({ error: "Codebook not found" }, 404);
    }
    const deployment = putDeployment(db, jobId, parsed.data, jobServer?.url ?? null);

    // Tell the job server to pick up the new version. Best effort: if it's
    // down, it reloads the spec itself on its next cold start or TTL refresh.
    try {
      await callJobServer(jobServerAdminEndpoints.refreshDeployment.path, "POST", jobId);
    } catch (err) {
      console.warn(`Could not notify job server of deployment ${jobId}:`, err);
    }
    return c.json(deployment);
  });

  // Reset: retire the live values of these variables (e.g. a loop's
  // questions), so the units are coded again. Nothing is deleted.
  app.post("/annotations/reset", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = ResetAnnotationsSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const retired = retireAnnotations(db, jobId, parsed.data);
    try {
      await callJobServer(jobServerAdminEndpoints.refreshDeployment.path, "POST", jobId);
    } catch (err) {
      console.warn(`Could not notify job server of reset in job ${jobId}:`, err);
    }
    return c.json({ retired });
  });

  // Ask the job server to re-check the deployment now; `units` also drops its
  // unit content cache (all, or these ids), e.g. after fixing a unit's text.
  app.post("/deployment/refresh", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = RefreshDeploymentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    if (!getDeployment(db, jobId)) return c.json({ error: "Job is not deployed" }, 404);
    if (!jobServer) return c.json({ error: "No job server configured" }, 503);
    try {
      const res = await callJobServer(jobServerAdminEndpoints.refreshDeployment.path, "POST", jobId, parsed.data);
      return c.json(await res!.json(), res!.status as 200);
    } catch {
      return c.json({ error: "Job server unreachable" }, 502);
    }
  });

  // A preview session for researchers (contracts PreviewSessionSchema): the
  // job server runs the latest codebook in memory, writing nothing back.
  app.post("/deployment/preview", requireJobUser(db, "WRITE"), (c) => {
    if (!jobServer) return c.json({ error: "No job server configured" }, 503);
    const jobId = c.get("jobId");
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    const token = issuer.previewToken(boundJobServer(db, jobId, jobServer.url)!, jobId, expiresAt);
    return c.json({ deploymentId: `${deploymentId(jobId)}.preview`, token, expiresAt: new Date(expiresAt) });
  });

  app.get("/deployment/status", requireJobUser(db, "READ"), async (c) => {
    const jobId = c.get("jobId");
    if (!getDeployment(db, jobId)) return c.json({ error: "Job is not deployed" }, 404);
    if (!jobServer) return c.json({ error: "No job server configured" }, 503);
    try {
      const res = await callJobServer(jobServerAdminEndpoints.getDeploymentStatus.path, "GET", jobId);
      return c.json(await res!.json(), res!.status as 200);
    } catch {
      return c.json({ error: "Job server unreachable" }, 502);
    }
  });

  return app;
}
