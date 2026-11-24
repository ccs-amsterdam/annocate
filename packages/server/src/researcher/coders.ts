import { Hono } from "hono";
import { listPage } from "../shared/paging.js";
import type { Server, Env } from "../context.js";
import { requireSensitive, requireStudyUser } from "./auth.js";
import { listCoderProgress } from "../shared/progress.js";
import { deleteCoders, listCoderDeletions, postponeDeletion } from "../shared/coderDeletion.js";
import { DeleteCodersSchema } from "@annotinder/contracts";
import { sql } from "drizzle-orm";
import { rows } from "../db/index.js";
import { idParam, parseJson } from "../shared/request.js";

/** Coder progress: who has joined and how far along they are. */
export function coders(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/coders", requireStudyUser(server, "READ"), async (c) =>
    c.json(listPage(c, "coders", await listCoderProgress(db, c.get("studyId")))),
  );

  // Per coder id, the units their sessions answered (they stay with the coder when units are
  // redistributed or moved), and the ones they were sent but didn't answer
  app.get("/study/:studyId/coders/units", requireStudyUser(server, "READ"), async (c) => {
    const studyId = c.get("studyId");
    const found = await rows<{ coder: string; coded: number[]; served: number[] }>(
      db,
      sql`SELECT coder,
            coalesce(array_agg(unit_id ORDER BY unit_id) FILTER (WHERE coded), '{}') AS "coded",
            coalesce(array_agg(unit_id ORDER BY unit_id) FILTER (WHERE NOT coded), '{}') AS "served"
          FROM (
            SELECT s.coder, seen.unit_id, bool_or(seen.coded) AS coded
            FROM (
              SELECT session_id, unit_id, false AS coded FROM unit_serves WHERE study_id = ${studyId}
              UNION ALL
              SELECT session_id, unit_id, true AS coded FROM annotation_values
                WHERE study_id = ${studyId} AND unit_id IS NOT NULL AND retired_at IS NULL
            ) seen
            JOIN coder_sessions s ON s.id = seen.session_id
            WHERE s.coder IS NOT NULL
            GROUP BY s.coder, seen.unit_id
          ) per_unit
          GROUP BY coder
          ORDER BY coder`,
    );
    return c.json({ coders: found });
  });

  app.post("/study/:studyId/coders/delete", requireStudyUser(server, "ADMIN"), requireSensitive(server), async (c) => {
    const body = await parseJson(c, DeleteCodersSchema);
    const studyId = c.get("studyId");
    const result = await deleteCoders(db, studyId, body, c.get("researcher").email);
    return c.json(result);
  });

  app.get("/study/:studyId/coders/deletions", requireStudyUser(server, "READ"), async (c) =>
    c.json(await listCoderDeletions(db, c.get("studyId"))),
  );

  app.post("/study/:studyId/coders/:id/deletion-request/postpone", requireStudyUser(server, "ADMIN"), async (c) => {
    if (!(await postponeDeletion(db, c.get("studyId"), idParam(c, "id"))))
      return c.json({ error: "No deletion request for this coder" }, 404);
    return c.body(null, 204);
  });

  return app;
}
