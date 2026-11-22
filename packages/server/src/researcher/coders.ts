import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireSensitive, requireStudyUser } from "./auth.js";
import { listCoderProgress } from "../shared/progress.js";
import { deleteCoders, listCoderDeletions, postponeDeletion } from "../shared/coderDeletion.js";
import { DeleteCodersSchema } from "@annotinder/contracts";
import { sql } from "drizzle-orm";
import { rows } from "../db/index.js";

/** Coder progress: who has joined and how far along they are. */
export function coders(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/coders", requireStudyUser(server, "READ"), async (c) =>
    c.json(await listCoderProgress(db, c.get("studyId"))),
  );

  // Per coder id, the units their sessions were shown or answered: what a new distribution can keep with them
  app.get("/study/:studyId/coders/units", requireStudyUser(server, "READ"), async (c) => {
    const studyId = c.get("studyId");
    const found = await rows<{ coder: string; unitIds: number[] }>(
      db,
      sql`SELECT s.coder, array_agg(DISTINCT seen.unit_id ORDER BY seen.unit_id) AS "unitIds"
          FROM (
            SELECT session_id, unit_id FROM unit_serves WHERE study_id = ${studyId}
            UNION
            SELECT session_id, unit_id FROM annotation_values
              WHERE study_id = ${studyId} AND unit_id IS NOT NULL AND retired_at IS NULL
          ) seen
          JOIN coder_sessions s ON s.id = seen.session_id
          WHERE s.coder IS NOT NULL
          GROUP BY s.coder
          ORDER BY s.coder`,
    );
    return c.json({ coders: found });
  });

  app.post("/study/:studyId/coders/delete", requireStudyUser(server, "ADMIN"), requireSensitive(server), async (c) => {
    const parsed = DeleteCodersSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const studyId = c.get("studyId");
    const result = await deleteCoders(db, studyId, parsed.data, c.get("researcher").email);
    return c.json(result);
  });

  app.get("/study/:studyId/coders/deletions", requireStudyUser(server, "READ"), async (c) =>
    c.json(await listCoderDeletions(db, c.get("studyId"))),
  );

  app.post("/study/:studyId/coders/:id/deletion-request/postpone", requireStudyUser(server, "ADMIN"), async (c) => {
    if (!(await postponeDeletion(db, c.get("studyId"), Number(c.req.param("id")))))
      return c.json({ error: "No deletion request for this coder" }, 404);
    return c.body(null, 204);
  });

  return app;
}
