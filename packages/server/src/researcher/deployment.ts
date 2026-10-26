import { Hono } from "hono";
import { DeploymentWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getDeployment, putDeployment } from "../shared/deployments.js";

export function deployment(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/deployment", requireJobUser(db, "READ"), async (c) => c.json(await getDeployment(db, c.get("jobId"))));

  app.put("/job/:jobId/deployment", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = DeploymentWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    if (!(await one(db, "SELECT 1 FROM codebooks WHERE job_id = $1 AND id = $2", [jobId, parsed.data.codebookId]))) {
      return c.json({ error: "Codebook not found" }, 404);
    }
    const deployed = await db.transaction((tx) => putDeployment(tx, jobId, parsed.data));
    await server.deployments.refresh(jobId);
    return c.json(deployed);
  });

  return app;
}
