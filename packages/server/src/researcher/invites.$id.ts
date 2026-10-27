import { Hono } from "hono";
import { z } from "zod";
import { IdSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toInviteResponse, type InviteRow } from "../shared/invites.js";

// Only unused invites: coders (and so their answers) refer to the invite they came from.
export function invite(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.delete("/job/:jobId/invites/:id", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await one<InviteRow>(db, "SELECT * FROM invites WHERE job_id = $1 AND id = $2", [jobId, id]);
    if (!existing) return c.json({ error: "Invite not found" }, 404);
    // `uses = 0` again in the delete: a coder may have joined meanwhile.
    const deleted = await db.query("DELETE FROM invites WHERE id = $1 AND uses = 0 RETURNING id", [id]);
    if (deleted.length === 0) return c.json({ error: "This invite has been used, so it can only be revoked" }, 409);
    return c.body(null, 204);
  });

  // Which units the invite's coders get in `invitation` mode. Coders already routed keep theirs.
  app.put("/job/:jobId/invites/:id/unitset", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const parsed = z.object({ unitsetId: IdSchema.nullable() }).safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { unitsetId } = parsed.data;
    if (unitsetId !== null && !(await one(db, "SELECT 1 FROM unitsets WHERE job_id = $1 AND id = $2", [jobId, unitsetId]))) {
      return c.json({ error: "Unitset not found" }, 400);
    }
    const row = await one<InviteRow>(db, "UPDATE invites SET unitset_id = $1 WHERE job_id = $2 AND id = $3 RETURNING *", [
      unitsetId,
      jobId,
      Number(c.req.param("id")),
    ]);
    if (!row) return c.json({ error: "Invite not found" }, 404);
    return c.json(toInviteResponse(row));
  });

  return app;
}
