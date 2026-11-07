import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { LinkWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { forgetLink, toLinkResponse, type LinkRow } from "../shared/links.js";

// Links (docs/plans/sets-and-session-parameters.md §4): made from the
// deployed codebook (shared/links.ts `syncLinks`); here only their access
// settings, revoking, and a new secret.
export function links(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/links", requireStudyUser(server, "WRITE"), async (c) => {
    const rows = await db.query<LinkRow>("SELECT * FROM links WHERE study_id = $1 ORDER BY retired_at IS NOT NULL, id", [c.get("studyId")]);
    return c.json(rows.map(toLinkResponse));
  });

  app.put("/study/:studyId/links/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const parsed = LinkWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { label, auth, emails, maxUses, participantId } = parsed.data;
    const row = await one<LinkRow>(
      db,
      `UPDATE links SET label = $3, auth = $4, emails = $5, max_uses = $6, participant_id = $7
       WHERE study_id = $1 AND id = $2 RETURNING *`,
      [
        c.get("studyId"),
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
    return c.json(toLinkResponse(row));
  });

  // No new coders from this link; coders who already started keep working.
  app.post("/study/:studyId/links/:id/revoke", requireStudyUser(server, "WRITE"), async (c) => {
    const row = await one<LinkRow>(
      db,
      "UPDATE links SET revoked_at = COALESCE(revoked_at, now()) WHERE study_id = $1 AND id = $2 RETURNING *",
      [c.get("studyId"), Number(c.req.param("id"))],
    );
    if (!row) return c.json({ error: "Link not found" }, 404);
    return c.json(toLinkResponse(row));
  });

  // A new secret: the old link stops working (e.g. it was shared too widely); sessions that started go on.
  app.post("/study/:studyId/links/:id/secret", requireStudyUser(server, "WRITE"), async (c) => {
    const old = await one<LinkRow>(db, "SELECT * FROM links WHERE study_id = $1 AND id = $2", [c.get("studyId"), Number(c.req.param("id"))]);
    if (!old) return c.json({ error: "Link not found" }, 404);
    const row = await one<LinkRow>(db, "UPDATE links SET secret = $2 WHERE id = $1 RETURNING *", [old.id, randomBytes(16).toString("hex")]);
    forgetLink(old.secret);
    return c.json(toLinkResponse(row!));
  });

  return app;
}
