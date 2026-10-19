import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { type InviteRow } from "../shared/invites.js";

// Only unused invites: coders (and so their answers) refer to the invite they came from.
export function invite(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.delete("/job/:jobId/invites/:id", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM invites WHERE jobId = ? AND id = ?").get(jobId, id) as
      | InviteRow
      | undefined;
    if (!existing) return c.json({ error: "Invite not found" }, 404);
    if (existing.uses > 0) return c.json({ error: "This invite has been used, so it can only be revoked" }, 409);
    db.prepare("DELETE FROM invites WHERE id = ?").run(id);
    return c.body(null, 204);
  });

  return app;
}
