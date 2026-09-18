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
    db.prepare("INSERT INTO invites (jobId, label, access, secret) VALUES (?, ?, ?, ?)").run(
      jobId,
      parsed.data.label,
      parsed.data.access,
      secret,
    );
    const row = db.prepare("SELECT * FROM invites WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as {
      id: number;
      jobId: number;
      label: string;
      access: CoderInviteResponse["access"];
      secret: string;
    };
    const response: CoderInviteResponse = {
      id: row.id,
      jobId: row.jobId,
      label: row.label,
      access: row.access,
      secret: row.secret,
    };
    return c.json(response, 201);
  });

  return app;
}
