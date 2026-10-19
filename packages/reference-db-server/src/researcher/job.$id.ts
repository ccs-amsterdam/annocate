import { Hono } from "hono";
import { JobWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toJobResponse, type JobRow } from "../shared/jobs.js";

export function job(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId", requireJobUser(db, "READ"), (c) => {
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(c.get("jobId")) as unknown as JobRow;
    return c.json(toJobResponse(row));
  });

  app.put("/job/:jobId", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = JobWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    db.prepare("UPDATE jobs SET name = ?, archived = ? WHERE id = ?").run(
      parsed.data.name,
      parsed.data.archived ? 1 : 0,
      c.get("jobId"),
    );
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(c.get("jobId")) as unknown as JobRow;
    return c.json(toJobResponse(row));
  });

  // Deleting the job cascades to all of its rows (schema.sql).
  app.delete("/job/:jobId", requireJobUser(db, "ADMIN"), (c) => {
    db.prepare("DELETE FROM jobs WHERE id = ?").run(c.get("jobId"));
    return c.body(null, 204);
  });

  return app;
}
