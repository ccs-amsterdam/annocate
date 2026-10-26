import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getDeployment } from "../shared/deployments.js";

export function deploymentStatus(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/deployment/status", requireJobUser(server, "READ"), async (c) => {
    const jobId = c.get("jobId");
    if (!(await getDeployment(db, jobId))) return c.json({ error: "Job is not deployed" }, 404);
    return c.json(await server.deployments.status(jobId));
  });

  return app;
}
