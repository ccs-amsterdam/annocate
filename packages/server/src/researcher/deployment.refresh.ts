import { Hono } from "hono";
import { RefreshDeploymentSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getDeployment } from "../shared/deployments.js";

// Re-read the deployment now; `units` also drops the unit content cache (all,
// or these ids), e.g. after fixing a unit's text.
export function deploymentRefresh(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post("/job/:jobId/deployment/refresh", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = RefreshDeploymentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    if (!(await getDeployment(db, jobId))) return c.json({ error: "Job is not deployed" }, 404);
    return c.json({ version: await server.deployments.refresh(jobId, parsed.data.units) });
  });

  return app;
}
