import { Hono } from "hono";
import { JobWriteSchema } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { toJobResponse, type JobRow } from "../shared/jobs.js";
import { effectiveLimits, ensureUser, usage } from "../shared/accounts.js";
import { HttpError } from "../shared/http.js";

// A server hosts any number of jobs. A researcher (account role, see
// docs/accounts.md) may create one within their limits: they own it (it
// counts against their limits) and become its ADMIN. The list shows the jobs
// a user has a role in (with development headers: all jobs).
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

  app.post("/job", requireResearcher(server, { role: "researcher" }), async (c) => {
    const parsed = JobWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const researcher = c.get("researcher");
    const ownerId = researcher.userId ?? (await ensureUser(db, researcher.email)).id;
    await checkJobLimit(db, ownerId);
    const row = await db.transaction(async (tx) => {
      const job = await one<JobRow>(tx, "INSERT INTO jobs (name, archived, owner_id, keep_sessions_open) VALUES ($1, $2, $3, $4) RETURNING *", [
        parsed.data.name,
        parsed.data.archived ?? false,
        ownerId,
        parsed.data.keepSessionsOpen ?? false,
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

/** Refuses a new job past the owner's limit on jobs (docs/accounts.md). */
export async function checkJobLimit(db: Sql, ownerId: number): Promise<void> {
  const { jobs: maxJobs } = await effectiveLimits(db, ownerId);
  if (maxJobs != null && (await usage(db, ownerId)).jobs >= maxJobs) {
    throw new HttpError(403, `You can own at most ${maxJobs} jobs: delete one, or ask an admin for more`, "limit_reached");
  }
}
