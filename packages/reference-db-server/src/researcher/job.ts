import { Hono } from "hono";
import { JobWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { toJobResponse, type JobRow } from "../shared/jobs.js";

// Multi-job deployment: a server can host any number of jobs. Listing and
// creating jobs has no natural "job owner" to gate against yet (job-user roles
// are per-job, granted via `PUT /job/:jobId/users` once a job exists), so any
// request with an `x-dev-role` header may list/create.
export function jobs(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job", (c) => {
    const role = c.req.header("x-dev-role");
    if (!role) return c.json({ error: "Unauthorized" }, 401);
    const rows = db.prepare("SELECT * FROM jobs ORDER BY id").all() as unknown as JobRow[];
    return c.json(rows.map(toJobResponse));
  });

  app.post("/job", async (c) => {
    const role = c.req.header("x-dev-role");
    if (!role) return c.json({ error: "Unauthorized" }, 401);

    const parsed = JobWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const created = new Date().toISOString();
    db.prepare("INSERT INTO jobs (name, archived, created) VALUES (?, ?, ?)").run(
      parsed.data.name,
      parsed.data.archived ? 1 : 0,
      created,
    );
    const row = db.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 1").get() as unknown as JobRow;
    return c.json(toJobResponse(row), 201);
  });

  return app;
}
