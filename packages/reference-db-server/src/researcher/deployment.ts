import { Hono } from "hono";
import { DeploymentWriteSchema, dbEndpoints } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getDeployment, putDeployment } from "../shared/deployments.js";
import { callJobServer } from "../shared/jobServer.js";

export function deployment(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/deployment", requireJobUser(db, "READ"), (c) => c.json(getDeployment(db, c.get("jobId"))));

  app.put("/job/:jobId/deployment", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = DeploymentWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    if (!db.prepare("SELECT 1 FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, parsed.data.codebookId)) {
      return c.json({ error: "Codebook not found" }, 404);
    }
    const deployed = putDeployment(db, jobId, parsed.data, server.jobServer?.url ?? null);

    // Best effort: if the job server is down, it reloads the spec itself on its next cold start or TTL refresh.
    try {
      await callJobServer(server, jobId, "POST", dbEndpoints.refreshDeployment.path);
    } catch (err) {
      console.warn(`Could not notify job server of deployment ${jobId}:`, err);
    }
    return c.json(deployed);
  });

  return app;
}
