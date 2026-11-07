import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { getDeployment } from "../shared/deployments.js";

export function deploymentStatus(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/deployment/status", requireStudyUser(server, "READ"), async (c) => {
    const studyId = c.get("studyId");
    if (!(await getDeployment(db, studyId))) return c.json({ error: "Study is not deployed" }, 404);
    return c.json(await server.deployments.status(studyId));
  });

  return app;
}
