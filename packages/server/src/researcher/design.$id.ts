import { Hono } from "hono";
import { DesignWriteSchema, sessionItem, type DesignConflict } from "@annotinder/contracts";
import { and, eq, sql } from "drizzle-orm";
import { designVersions } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { toDesignVersion, type DesignVersionRow } from "../shared/designVersions.js";

/** The 409 for a save based on an older revision (contracts `DesignConflictSchema`). */
function conflict(row: DesignVersionRow): DesignConflict {
  return {
    error: `${row.updatedBy ?? "Someone"} saved this draft since you opened it`,
    code: "design_conflict",
    updated: row.updated,
    updatedBy: row.updatedBy,
    revision: row.revision,
  };
}

export function designVersion(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const versionWhere = (studyId: number, id: number) =>
    and(eq(designVersions.studyId, studyId), eq(designVersions.id, id));
  const findVersion = async (studyId: number, id: number) =>
    (await db.select().from(designVersions).where(versionWhere(studyId, id)))[0];

  app.get("/study/:studyId/design/:id", requireStudyUser(server, "READ"), async (c) => {
    const row = await findVersion(c.get("studyId"), Number(c.req.param("id")));
    if (!row) return c.json({ error: "Design version not found" }, 404);
    return c.json(toDesignVersion(row));
  });

  app.put("/study/:studyId/design/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const id = Number(c.req.param("id"));
    const existing = await findVersion(studyId, id);
    if (!existing) return c.json({ error: "Design version not found" }, 404);
    if (existing.immutable) return c.json({ error: "Design version is deployed and cannot be edited" }, 409);

    const parsed = DesignWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    if (sessionItem(parsed.data.items))
      return c.json({ error: "The session and public info go in `session` and `public`, not among the items" }, 400);
    // Saved by someone else since the edits started: don't overwrite their work.
    const { revision } = parsed.data;
    if (revision !== undefined && revision !== existing.revision) return c.json(conflict(existing), 409);

    const { note, items, units, session, public: info } = parsed.data;
    const [row] = await db
      .update(designVersions)
      .set({
        note: note ?? null,
        items,
        // Left out: kept (public: null is none)
        ...(units ? { units } : {}),
        ...(session ? { session } : {}),
        ...(info !== undefined ? { public: info } : {}),
        updated: sql`now()`,
        updatedBy: c.get("studyUser")?.email ?? null,
        revision: sql`${designVersions.revision} + 1`,
      })
      .where(
        and(
          versionWhere(studyId, id),
          eq(designVersions.immutable, false),
          revision === undefined ? undefined : eq(designVersions.revision, revision),
        ),
      )
      .returning();
    if (!row) {
      // Deployed or saved by someone else meanwhile.
      const now = await findVersion(studyId, id);
      if (now && !now.immutable) return c.json(conflict(now), 409);
      return c.json({ error: "Design version is deployed and cannot be edited" }, 409);
    }
    return c.json(toDesignVersion(row));
  });

  app.delete("/study/:studyId/design/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const id = Number(c.req.param("id"));
    const existing = await findVersion(studyId, id);
    if (!existing) return c.json({ error: "Design version not found" }, 404);
    if (existing.immutable) return c.json({ error: "Design version is deployed and cannot be deleted" }, 409);

    await db.delete(designVersions).where(and(versionWhere(studyId, id), eq(designVersions.immutable, false)));
    return c.body(null, 204);
  });

  return app;
}
