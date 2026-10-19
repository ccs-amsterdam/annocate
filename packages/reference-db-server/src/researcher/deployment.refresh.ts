import { Hono } from "hono";
import { RefreshDeploymentSchema, dbEndpoints } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getDeployment } from "../shared/deployments.js";
import { callJobServer } from "../shared/jobServer.js";

// Ask the job server to re-check the deployment now; `units` also drops its
// unit content cache (all, or these ids), e.g. after fixing a unit's text.
export function deploymentRefresh(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post("/job/:jobId/deployment/refresh", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = RefreshDeploymentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    if (!getDeployment(db, jobId)) return c.json({ error: "Job is not deployed" }, 404);
    if (!server.jobServer) return c.json({ error: "No job server configured" }, 503);
    try {
      const res = await callJobServer(server, jobId, "POST", dbEndpoints.refreshDeployment.path, parsed.data);
      return c.json(await res!.json(), res!.status as 200);
    } catch {
      return c.json({ error: "Job server unreachable" }, 502);
    }
  });

  return app;
}
