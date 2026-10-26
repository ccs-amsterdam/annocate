import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toInviteResponse, type InviteRow } from "../shared/invites.js";

// No new coders from this invite; coders who already started keep working.
export function inviteRevoke(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const getInvite = (jobId: number, id: number) =>
    db.prepare("SELECT * FROM invites WHERE jobId = ? AND id = ?").get(jobId, id) as unknown as InviteRow | undefined;

  app.post("/job/:jobId/invites/:id/revoke", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const invite = getInvite(jobId, id);
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.revokedAt === null) {
      db.prepare("UPDATE invites SET revokedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
    }
    return c.json(toInviteResponse(getInvite(jobId, id)!));
  });

  return app;
}
