import { Hono } from "hono";
import { JobWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toJobResponse, type JobRow } from "../shared/jobs.js";

export function job(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId", requireJobUser(server, "READ"), async (c) => {
    const row = await one<JobRow>(db, "SELECT * FROM jobs WHERE id = $1", [c.get("jobId")]);
    return c.json(toJobResponse(row!));
  });

  app.put("/job/:jobId", requireJobUser(server, "ADMIN"), async (c) => {
    const parsed = JobWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const row = await one<JobRow>(
      db,
      "UPDATE jobs SET name = $1, archived = $2, keep_sessions_open = COALESCE($3, keep_sessions_open) WHERE id = $4 RETURNING *",
      [parsed.data.name, parsed.data.archived ?? false, parsed.data.keepSessionsOpen ?? null, c.get("jobId")],
    );
    // The runtime reads whether sessions stay open with the deployment.
    await server.deployments.refresh(c.get("jobId"));
    return c.json(toJobResponse(row!));
  });

  // Deleting the job cascades to all of its rows (migrations/).
  app.delete("/job/:jobId", requireJobUser(server, "ADMIN"), async (c) => {
    await db.query("DELETE FROM jobs WHERE id = $1", [c.get("jobId")]);
    server.deployments.drop(c.get("jobId"));
    return c.body(null, 204);
  });

  return app;
}
