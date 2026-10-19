import { Hono } from "hono";
import { JobUsersWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";

export function jobUsers(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/users", requireJobUser(db, "ADMIN"), (c) => {
    const rows = db.prepare("SELECT email, role FROM job_users WHERE jobId = ?").all(c.get("jobId"));
    return c.json(rows);
  });

  app.put("/job/:jobId/users", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = JobUsersWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    db.prepare("DELETE FROM job_users WHERE jobId = ?").run(jobId);
    const insert = db.prepare("INSERT INTO job_users (jobId, email, role) VALUES (?, ?, ?)");
    for (const user of parsed.data.users) {
      insert.run(jobId, user.email, user.role);
    }
    return c.body(null, 204);
  });

  return app;
}
