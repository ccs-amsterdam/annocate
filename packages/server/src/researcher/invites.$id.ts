import { Hono } from "hono";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { type InviteRow } from "../shared/invites.js";

// Only unused invites: coders (and so their answers) refer to the invite they came from.
export function invite(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.delete("/job/:jobId/invites/:id", requireJobUser(db, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await one<InviteRow>(db, "SELECT * FROM invites WHERE job_id = $1 AND id = $2", [jobId, id]);
    if (!existing) return c.json({ error: "Invite not found" }, 404);
    // `uses = 0` again in the delete: a coder may have joined meanwhile.
    const deleted = await db.query("DELETE FROM invites WHERE id = $1 AND uses = 0 RETURNING id", [id]);
    if (deleted.length === 0) return c.json({ error: "This invite has been used, so it can only be revoked" }, 409);
    return c.body(null, 204);
  });

  return app;
}
