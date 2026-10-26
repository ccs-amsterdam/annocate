import { Hono } from "hono";
import { JobWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { toJobResponse, type JobRow } from "../shared/jobs.js";

// Multi-job deployment: a server can host any number of jobs. Listing and
// creating jobs has no natural "job owner" to gate against yet (job-user roles
// are per-job, granted via `PUT /job/:jobId/users` once a job exists), so any
// request with an `x-dev-role` header may list/create.
export function jobs(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job", async (c) => {
    const role = c.req.header("x-dev-role");
    if (!role) return c.json({ error: "Unauthorized" }, 401);
    const rows = await db.query<JobRow>("SELECT * FROM jobs ORDER BY id");
    return c.json(rows.map(toJobResponse));
  });

  app.post("/job", async (c) => {
    const role = c.req.header("x-dev-role");
    if (!role) return c.json({ error: "Unauthorized" }, 401);

    const parsed = JobWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const row = await one<JobRow>(db, "INSERT INTO jobs (name, archived) VALUES ($1, $2) RETURNING *", [
      parsed.data.name,
      parsed.data.archived ?? false,
    ]);
    return c.json(toJobResponse(row!), 201);
  });

  return app;
}
