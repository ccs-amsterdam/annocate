import { Hono } from "hono";
import { dbEndpoints } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getDeployment } from "../shared/deployments.js";
import { callJobServer } from "../shared/jobServer.js";

export function deploymentStatus(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/deployment/status", requireJobUser(db, "READ"), async (c) => {
    const jobId = c.get("jobId");
    if (!getDeployment(db, jobId)) return c.json({ error: "Job is not deployed" }, 404);
    if (!server.jobServer) return c.json({ error: "No job server configured" }, 503);
    try {
      const res = await callJobServer(server, jobId, "GET", dbEndpoints.getDeploymentStatus.path);
      return c.json(await res!.json(), res!.status as 200);
    } catch {
      return c.json({ error: "Job server unreachable" }, 502);
    }
  });

  return app;
}
