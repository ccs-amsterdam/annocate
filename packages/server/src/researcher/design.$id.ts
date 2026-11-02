import { Hono } from "hono";
import { DesignWriteSchema, sessionItem, type DesignConflict } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
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

  const get = (jobId: number, id: number) => one<DesignVersionRow>(db, "SELECT * FROM design_versions WHERE job_id = $1 AND id = $2", [jobId, id]);

  app.get("/job/:jobId/design/:id", requireJobUser(server, "READ"), async (c) => {
    const row = await get(c.get("jobId"), Number(c.req.param("id")));
    if (!row) return c.json({ error: "Codebook not found" }, 404);
    return c.json(toDesignVersion(row));
  });

  app.put("/job/:jobId/design/:id", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Codebook not found" }, 404);
    if (existing.immutable) return c.json({ error: "Codebook is immutable and cannot be edited" }, 409);

    const parsed = DesignWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    if (sessionItem(parsed.data.items)) return c.json({ error: "The session goes in `session`, not among the items" }, 400);
    // Saved by someone else since the edits started: don't overwrite their work.
    const { revision } = parsed.data;
    if (revision !== undefined && revision !== existing.revision) return c.json(conflict(existing), 409);

    const row = await one<DesignVersionRow>(
      db,
      `UPDATE design_versions SET note = $1, items = $2, units = COALESCE($7::jsonb, units), session = CASE WHEN $9 THEN $8::jsonb ELSE session END, updated = now(), updated_by = $3, revision = revision + 1
       WHERE job_id = $4 AND id = $5 AND NOT immutable AND ($6::int IS NULL OR revision = $6) RETURNING *`,
      [
        parsed.data.note ?? null,
        JSON.stringify(parsed.data.items),
        c.get("jobUser")?.email ?? null,
        jobId,
        id,
        revision ?? null,
        parsed.data.units ? JSON.stringify(parsed.data.units) : null,
        parsed.data.session ? JSON.stringify(parsed.data.session) : null,
        // Left out: kept; null: none
        parsed.data.session !== undefined,
      ],
    );
    if (!row) {
      // Deployed or saved by someone else meanwhile.
      const now = await get(jobId, id);
      if (now && !now.immutable) return c.json(conflict(now), 409);
      return c.json({ error: "Codebook is immutable and cannot be edited" }, 409);
    }
    return c.json(toDesignVersion(row));
  });

  app.delete("/job/:jobId/design/:id", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Codebook not found" }, 404);
    if (existing.immutable) return c.json({ error: "Codebook is immutable and cannot be deleted" }, 409);

    await db.query("DELETE FROM design_versions WHERE job_id = $1 AND id = $2 AND NOT immutable", [jobId, id]);
    return c.body(null, 204);
  });

  return app;
}
