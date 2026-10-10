import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { CoderInviteWriteSchema, type CoderProgress, type CoderInviteResponse } from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";
import type { CoderRow } from "../auth.js";

function toProgress(row: CoderRow): CoderProgress {
  const doneUnitIds = JSON.parse(row.doneUnitIds) as Record<string, number[]>;
  const unitsDone: Record<string, number> = {};
  for (const [unitset, ids] of Object.entries(doneUnitIds)) unitsDone[unitset] = ids.length;
  return { id: row.id, email: row.email ?? undefined, unitsDone };
}

interface InviteRow {
  id: number;
  jobId: number;
  label: string;
  access: CoderInviteResponse["access"];
  secret: string;
  emails: string | null;
  maxUses: number | null;
  uses: number;
  variables: string;
}

function toInviteResponse(row: InviteRow): CoderInviteResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    label: row.label,
    access: row.access,
    secret: row.secret,
    uses: row.uses,
    ...(row.emails ? { emails: JSON.parse(row.emails) } : {}),
    ...(row.maxUses !== null ? { maxUses: row.maxUses } : {}),
    variables: JSON.parse(row.variables),
  };
}

export function coderRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/coders", requireJobUser(db, "WRITE"), (c) => {
    const rows = db.prepare("SELECT * FROM coders WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as CoderRow[];
    return c.json(rows.map(toProgress));
  });

  app.post("/coders/invite", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = CoderInviteWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const secret = randomBytes(16).toString("hex");
    const { label, access, emails, maxUses, variables } = parsed.data;
    db.prepare(
      "INSERT INTO invites (jobId, label, access, secret, emails, maxUses, variables) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(jobId, label, access, secret, emails ? JSON.stringify(emails) : null, maxUses ?? null, JSON.stringify(variables ?? {}));
    const row = db.prepare("SELECT * FROM invites WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as unknown as InviteRow;
    return c.json(toInviteResponse(row), 201);
  });

  return app;
}
