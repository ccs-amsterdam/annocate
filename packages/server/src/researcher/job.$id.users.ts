import { Hono } from "hono";
import { JobUsersWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";

export function jobUsers(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/users", requireJobUser(server, "ADMIN"), async (c) =>
    c.json(await db.query("SELECT email, role FROM job_users WHERE job_id = $1", [c.get("jobId")])),
  );

  app.put("/job/:jobId/users", requireJobUser(server, "ADMIN"), async (c) => {
    const parsed = JobUsersWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    // The list replaces the job's users: it must keep someone who can manage them.
    if (!parsed.data.users.some((u) => u.role === "ADMIN")) return c.json({ error: "A job needs at least one ADMIN" }, 400);

    // Accounts are keyed on the lowercased email (shared/accounts.ts).
    const users = parsed.data.users.map((u) => ({ ...u, email: u.email.trim().toLowerCase() }));
    const emails = users.map((u) => u.email);
    const twice = emails.find((e, i) => emails.indexOf(e) !== i);
    if (twice) return c.json({ error: `${twice} is in the list twice` }, 400);

    const jobId = c.get("jobId");
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM job_users WHERE job_id = $1", [jobId]);
      for (const user of users) {
        await tx.query("INSERT INTO job_users (job_id, email, role) VALUES ($1, $2, $3)", [jobId, user.email, user.role]);
      }
    });
    return c.body(null, 204);
  });

  return app;
}
