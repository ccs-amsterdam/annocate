import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { CoderInviteWriteSchema, type CoderInviteResponse } from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";
import { jobOverview, listCoderProgress } from "../db/progress.js";

interface InviteRow {
  id: number;
  jobId: number;
  label: string;
  access: string;
  secret: string;
  emails: string | null;
  maxUses: number | null;
  uses: number;
  variables: string;
  participantId: string | null;
  participantFromUrl: number;
  created: string | null;
  revokedAt: string | null;
}

/** Invites created before `access` was renamed to `auth`. */
const LEGACY_ACCESS: Record<string, CoderInviteResponse["auth"]> = {
  only_anonymous: "none",
  user_decides: "optional",
  only_authenticated: "required",
};

function toInviteResponse(row: InviteRow): CoderInviteResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    label: row.label,
    auth: LEGACY_ACCESS[row.access] ?? (row.access as CoderInviteResponse["auth"]),
    secret: row.secret,
    uses: row.uses,
    ...(row.emails ? { emails: JSON.parse(row.emails) } : {}),
    ...(row.maxUses !== null ? { maxUses: row.maxUses } : {}),
    variables: JSON.parse(row.variables),
    ...(row.participantId !== null ? { participantId: row.participantId } : {}),
    ...(row.participantFromUrl ? { participantFromUrl: true } : {}),
    created: row.created ? new Date(row.created) : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
  };
}

/** Coder progress, invitations (docs/plan-job-admin.md) and the job overview. */
export function coderRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();
  const getInvite = (jobId: number, id: number) =>
    db.prepare("SELECT * FROM invites WHERE jobId = ? AND id = ?").get(jobId, id) as unknown as InviteRow | undefined;

  app.get("/coders", requireJobUser(db, "WRITE"), (c) => c.json(listCoderProgress(db, c.get("jobId"))));

  app.get("/overview", requireJobUser(db, "READ"), (c) => c.json(jobOverview(db, c.get("jobId"))));

  app.get("/invites", requireJobUser(db, "WRITE"), (c) => {
    const rows = db.prepare("SELECT * FROM invites WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as InviteRow[];
    return c.json(rows.map(toInviteResponse));
  });

  app.post("/invites", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = CoderInviteWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const secret = randomBytes(16).toString("hex");
    const { label, auth, emails, maxUses, variables, participantId, participantFromUrl } = parsed.data;
    db.prepare(
      `INSERT INTO invites (jobId, label, access, secret, emails, maxUses, variables, participantId, participantFromUrl, created)
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

  // No new coders from this invite; coders who already started keep working.
  app.post("/invites/:id/revoke", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const invite = getInvite(jobId, id);
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.revokedAt === null) {
      db.prepare("UPDATE invites SET revokedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
    }
    return c.json(toInviteResponse(getInvite(jobId, id)!));
  });

  // Only unused invites: coders (and so their answers) refer to the invite they came from.
  app.delete("/invites/:id", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const invite = getInvite(jobId, id);
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.uses > 0) return c.json({ error: "This invite has been used, so it can only be revoked" }, 409);
    db.prepare("DELETE FROM invites WHERE id = ?").run(id);
    return c.body(null, 204);
  });

  return app;
}
