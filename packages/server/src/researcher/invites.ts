import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { CoderInviteWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toInviteResponse, type InviteRow } from "../shared/invites.js";

export function invites(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/invites", requireJobUser(db, "WRITE"), async (c) => {
    const rows = await db.query<InviteRow>("SELECT * FROM invites WHERE job_id = $1 ORDER BY id", [c.get("jobId")]);
    return c.json(rows.map(toInviteResponse));
  });

  app.post("/job/:jobId/invites", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = CoderInviteWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const secret = randomBytes(16).toString("hex");
    const { label, auth, emails, maxUses, variables, participantId, participantFromUrl } = parsed.data;
    const row = await one<InviteRow>(
      db,
      `INSERT INTO invites (job_id, label, auth, secret, emails, max_uses, variables, participant_id, participant_from_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        c.get("jobId"),
        label,
        auth,
        secret,
        emails ? JSON.stringify(emails) : null,
        maxUses ?? null,
        JSON.stringify(variables ?? {}),
        participantId ?? null,
        participantFromUrl ?? false,
      ],
    );
    return c.json(toInviteResponse(row!), 201);
  });

  return app;
}
