import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { CoderInviteWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { forgetLink, toInviteResponse, type InviteRow } from "../shared/invites.js";

// Links (docs/plans/sets-and-session-parameters.md §4): made from the
// published codebook (shared/invites.ts `syncLinks`); here only their access
// settings, revoking, and a new secret.
export function invites(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/invites", requireJobUser(server, "WRITE"), async (c) => {
    const rows = await db.query<InviteRow>("SELECT * FROM invites WHERE job_id = $1 ORDER BY retired_at IS NOT NULL, id", [c.get("jobId")]);
    return c.json(rows.map(toInviteResponse));
  });

  app.put("/job/:jobId/invites/:id", requireJobUser(server, "WRITE"), async (c) => {
    const parsed = CoderInviteWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { label, auth, emails, maxUses, participantId } = parsed.data;
    const row = await one<InviteRow>(
      db,
      `UPDATE invites SET label = $3, auth = $4, emails = $5, max_uses = $6, participant_id = $7
       WHERE job_id = $1 AND id = $2 RETURNING *`,
      [
        c.get("jobId"),
        Number(c.req.param("id")),
        label,
        auth,
        emails?.length ? JSON.stringify(emails.map((e) => e.toLowerCase())) : null,
        maxUses ?? null,
        participantId ?? null,
      ],
    );
    if (!row) return c.json({ error: "Link not found" }, 404);
    forgetLink(row.secret);
    return c.json(toInviteResponse(row));
  });

  // No new coders from this link; coders who already started keep working.
  app.post("/job/:jobId/invites/:id/revoke", requireJobUser(server, "WRITE"), async (c) => {
    const row = await one<InviteRow>(
      db,
      "UPDATE invites SET revoked_at = COALESCE(revoked_at, now()) WHERE job_id = $1 AND id = $2 RETURNING *",
      [c.get("jobId"), Number(c.req.param("id"))],
    );
    if (!row) return c.json({ error: "Link not found" }, 404);
    return c.json(toInviteResponse(row));
  });

  // A new secret: the old link stops working (e.g. it was shared too widely); sessions that started go on.
  app.post("/job/:jobId/invites/:id/secret", requireJobUser(server, "WRITE"), async (c) => {
    const old = await one<InviteRow>(db, "SELECT * FROM invites WHERE job_id = $1 AND id = $2", [c.get("jobId"), Number(c.req.param("id"))]);
    if (!old) return c.json({ error: "Link not found" }, 404);
    const row = await one<InviteRow>(db, "UPDATE invites SET secret = $2 WHERE id = $1 RETURNING *", [old.id, randomBytes(16).toString("hex")]);
    forgetLink(old.secret);
    return c.json(toInviteResponse(row!));
  });

  return app;
}
