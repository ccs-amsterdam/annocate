import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { DeploymentWriteSchema, ResetAnnotationsSchema, jobServerAdminEndpoints } from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";
import { getDeployment, putDeployment } from "../db/deployments.js";
import { retireAnnotations } from "../db/annotations.js";

/** Where this db server's jobs are deployed, and how the job server knows this db server. */
export interface JobServerLink {
  url: string;
  /** This db server's name in the job server's backend config; deployment ids are `<backendName>.<jobId>`. */
  backendName: string;
  secret: string;
  fetch?: typeof fetch;
}

export function deploymentRoutes(db: DatabaseSync, jobServer?: JobServerLink) {
  const app = new Hono<HonoEnv>();

  const callJobServer = (path: string, method: "GET" | "POST", jobId: number) => {
    if (!jobServer) return Promise.resolve(null);
    const url = jobServer.url + path.replace(":deploymentId", `${jobServer.backendName}.${jobId}`);
    return (jobServer.fetch ?? fetch)(url, { method, headers: { authorization: `Bearer ${jobServer.secret}` } });
  };

  app.get("/deployment", requireJobUser(db, "READ"), (c) => c.json(getDeployment(db, c.get("jobId"))));

  app.put("/deployment", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = DeploymentWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    if (!db.prepare("SELECT 1 FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, parsed.data.codebookId)) {
      return c.json({ error: "Codebook not found" }, 404);
    }
    const deployment = putDeployment(db, jobId, parsed.data);

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
