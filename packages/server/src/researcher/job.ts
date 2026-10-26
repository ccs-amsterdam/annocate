import { Hono } from "hono";
import { JobWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { toJobResponse, type JobRow } from "../shared/jobs.js";

// A server hosts any number of jobs. Any authenticated researcher may create
// one, and becomes its ADMIN; the list shows the jobs they have a role in
// (with development headers: all jobs).
export function jobs(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job", requireResearcher(server), async (c) => {
    const researcher = c.get("researcher");
    const rows = researcher.devRole
      ? await db.query<JobRow>("SELECT * FROM jobs ORDER BY id")
      : await db.query<JobRow>(
          "SELECT j.* FROM jobs j JOIN job_users u ON u.job_id = j.id WHERE u.email = $1 ORDER BY j.id",
          [researcher.email],
        );
    return c.json(rows.map(toJobResponse));
  });

  app.post("/job", requireResearcher(server), async (c) => {
    const parsed = JobWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const researcher = c.get("researcher");
    const row = await db.transaction(async (tx) => {
      const job = await one<JobRow>(tx, "INSERT INTO jobs (name, archived) VALUES ($1, $2) RETURNING *", [
        parsed.data.name,
        parsed.data.archived ?? false,
      ]);
      // Development headers keep the bootstrap rule instead (a job without job users is open).
      if (!researcher.devRole) {
        await tx.query("INSERT INTO job_users (job_id, email, role) VALUES ($1, $2, 'ADMIN')", [job!.id, researcher.email]);
      }
      return job!;
    });
    return c.json(toJobResponse(row), 201);
  });

  return app;
}
