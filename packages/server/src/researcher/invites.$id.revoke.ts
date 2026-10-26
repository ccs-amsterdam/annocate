import { Hono } from "hono";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toInviteResponse, type InviteRow } from "../shared/invites.js";

// No new coders from this invite; coders who already started keep working.
export function inviteRevoke(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post("/job/:jobId/invites/:id/revoke", requireJobUser(server, "WRITE"), async (c) => {
    const row = await one<InviteRow>(
      db,
      "UPDATE invites SET revoked_at = COALESCE(revoked_at, now()) WHERE job_id = $1 AND id = $2 RETURNING *",
      [c.get("jobId"), Number(c.req.param("id"))],
    );
    if (!row) return c.json({ error: "Invite not found" }, 404);
    return c.json(toInviteResponse(row));
  });

  return app;
}
