import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { JobWriteSchema, JobUsersWriteSchema, type JobResponse } from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";

interface JobRow {
  id: number;
  name: string;
  archived: number;
  created: string;
}

function toJobResponse(row: JobRow): JobResponse {
  return { id: row.id, name: row.name, archived: !!row.archived, created: new Date(row.created) };
}

export function jobRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  // Multi-job deployment (design plan §2): a server can host any number of
  // jobs. Listing/creating jobs themselves has no natural "job owner" to
  // gate against yet (job-user roles are per-job, granted via
  // `PUT /job/:id/users` once a job exists) -- any request with a
  // recognized `x-dev-role` header may list/create, mirroring the
  // bootstrap-auth convenience used for a fresh job's first user.
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

  app.get("/job/:id", requireJobUser(db, "READ"), (c) => {
    const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(c.get("jobId")) as unknown as JobRow;
    return c.json(toJobResponse(row));
  });

  app.put("/job/:id", requireJobUser(db, "ADMIN"), async (c) => {
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

  app.delete("/job/:id", requireJobUser(db, "ADMIN"), (c) => {
    const jobId = c.get("jobId");
    for (const table of ["job_users", "codebooks", "unitsets", "units", "coders", "invites", "jobs"]) {
      db.prepare(`DELETE FROM ${table} WHERE ${table === "jobs" ? "id" : "jobId"} = ?`).run(jobId);
    }
    return c.body(null, 204);
  });

  app.get("/job/:id/users", requireJobUser(db, "ADMIN"), (c) => {
    const rows = db.prepare("SELECT email, role FROM job_users WHERE jobId = ?").all(c.get("jobId"));
    return c.json(rows);
  });

  app.put("/job/:id/users", requireJobUser(db, "ADMIN"), async (c) => {
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
