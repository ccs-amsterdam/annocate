import { Hono } from "hono";
import { DesignWriteSchema, sessionItem, type DesignConflict } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { toDesignVersion, type DesignVersionRow } from "../shared/designVersions.js";

/** The 409 for a save based on an older revision (contracts `DesignConflictSchema`). */
function conflict(row: DesignVersionRow): DesignConflict {
  return {
    error: `${row.updated_by ?? "Someone"} saved this draft since you opened it`,
    code: "design_conflict",
    updated: row.updated,
    updatedBy: row.updated_by,
    revision: row.revision,
  };
}

export function designVersion(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const get = (studyId: number, id: number) => one<DesignVersionRow>(db, "SELECT * FROM design_versions WHERE study_id = $1 AND id = $2", [studyId, id]);

  app.get("/study/:studyId/design/:id", requireStudyUser(server, "READ"), async (c) => {
    const row = await get(c.get("studyId"), Number(c.req.param("id")));
    if (!row) return c.json({ error: "Design version not found" }, 404);
    return c.json(toDesignVersion(row));
  });

  app.put("/study/:studyId/design/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const id = Number(c.req.param("id"));
    const existing = await get(studyId, id);
    if (!existing) return c.json({ error: "Design version not found" }, 404);
    if (existing.immutable) return c.json({ error: "Design version is deployed and cannot be edited" }, 409);

    const parsed = DesignWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    if (sessionItem(parsed.data.items)) return c.json({ error: "The session and public info go in `session` and `public`, not among the items" }, 400);
    // Saved by someone else since the edits started: don't overwrite their work.
    const { revision } = parsed.data;
    if (revision !== undefined && revision !== existing.revision) return c.json(conflict(existing), 409);

    const row = await one<DesignVersionRow>(
      db,
      `UPDATE design_versions SET note = $1, items = $2, units = COALESCE($7::jsonb, units), session = COALESCE($8::jsonb, session), public = CASE WHEN $9 THEN $10::jsonb ELSE public END, updated = now(), updated_by = $3, revision = revision + 1
       WHERE study_id = $4 AND id = $5 AND NOT immutable AND ($6::int IS NULL OR revision = $6) RETURNING *`,
      [
        parsed.data.note ?? null,
        JSON.stringify(parsed.data.items),
        c.get("studyUser")?.email ?? null,
        studyId,
        id,
        revision ?? null,
        parsed.data.units ? JSON.stringify(parsed.data.units) : null,
        // Left out: kept
        parsed.data.session ? JSON.stringify(parsed.data.session) : null,
        // Left out: kept; null: none
        parsed.data.public !== undefined,
        parsed.data.public ? JSON.stringify(parsed.data.public) : null,
      ],
    );
    if (!row) {
      // Deployed or saved by someone else meanwhile.
      const now = await get(studyId, id);
      if (now && !now.immutable) return c.json(conflict(now), 409);
      return c.json({ error: "Design version is deployed and cannot be edited" }, 409);
    }
    return c.json(toDesignVersion(row));
  });

  app.delete("/study/:studyId/design/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const id = Number(c.req.param("id"));
    const existing = await get(studyId, id);
    if (!existing) return c.json({ error: "Design version not found" }, 404);
    if (existing.immutable) return c.json({ error: "Design version is deployed and cannot be deleted" }, 409);

    await db.query("DELETE FROM design_versions WHERE study_id = $1 AND id = $2 AND NOT immutable", [studyId, id]);
    return c.body(null, 204);
  });

  return app;
}
