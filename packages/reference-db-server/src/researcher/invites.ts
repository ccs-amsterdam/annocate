import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { CoderInviteWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toInviteResponse, type InviteRow } from "../shared/invites.js";

export function invites(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/invites", requireJobUser(db, "WRITE"), (c) => {
    const rows = db.prepare("SELECT * FROM invites WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as InviteRow[];
    return c.json(rows.map(toInviteResponse));
  });

  app.post("/job/:jobId/invites", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = CoderInviteWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const secret = randomBytes(16).toString("hex");
    const { label, auth, emails, maxUses, variables, participantId, participantFromUrl } = parsed.data;
    db.prepare(
      `INSERT INTO invites (jobId, label, auth, secret, emails, maxUses, variables, participantId, participantFromUrl, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      jobId,
      label,
      auth,
      secret,
      emails ? JSON.stringify(emails) : null,
      maxUses ?? null,
      JSON.stringify(variables ?? {}),
      participantId ?? null,
      participantFromUrl ? 1 : 0,
      new Date().toISOString(),
    );
    const row = db.prepare("SELECT * FROM invites WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as unknown as InviteRow;
    return c.json(toInviteResponse(row), 201);
  });

  return app;
}
