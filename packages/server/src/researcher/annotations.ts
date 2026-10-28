import { Hono } from "hono";
import { AnnotationsQuerySchema, UnitVersionsQuerySchema, type AnnotationRow, type UnitVersion } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";

/**
 * Annotations, one row per unit, coder and variable, a page at a time in
 * the order they were written (contracts annotations.ts). The cursor is the
 * row id, so a page never changes once read, also while coders keep coding.
 */
export function annotations(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/annotations", requireJobUser(server, "READ"), async (c) => {
    const parsed = AnnotationsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { after, limit, retired } = parsed.data;
    const rows = await db.query<AnnotationRow & { retiredAt: Date | null }>(
      `SELECT a.id, a.unit_id AS "unitId", u.external_id AS "externalId", a.coder_id AS "coderId",
         c.participant_id AS "participantId", a.variable, a.value, a.codebook_id AS "codebookId",
         a.unit_version_id AS "unitVersionId", a.device_id AS "deviceId", a.assigned, a.created, a.updated, a.retired_at AS "retiredAt"
       FROM annotation_values a
       LEFT JOIN units u ON u.id = a.unit_id
       LEFT JOIN coders c ON c.id = a.coder_id
       WHERE a.job_id = $1 AND a.id > $2 AND ($3 OR a.retired_at IS NULL)
       ORDER BY a.id LIMIT $4`,
      [c.get("jobId"), after ?? 0, retired, limit + 1],
    );
    const page = rows.slice(0, limit).map((row) => {
      const out: AnnotationRow = { ...row };
      if (!retired) delete out.retiredAt;
      return out;
    });
    return c.json({ annotations: page, next: rows.length > limit ? page[page.length - 1].id : null });
  });

  app.get("/job/:jobId/devices", requireJobUser(server, "READ"), async (c) =>
    c.json(
      await db.query(
        `SELECT id, coder_id AS "coderId", device_type AS type, browser, os, created FROM coder_devices WHERE job_id = $1 ORDER BY id`,
        [c.get("jobId")],
      ),
    ),
  );

  // Units as coders saw them (contracts UnitVersionSchema), oldest first.
  app.get("/job/:jobId/unit-versions", requireJobUser(server, "READ"), async (c) => {
    const parsed = UnitVersionsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { after, limit } = parsed.data;
    const rows = await db.query<UnitVersion>(
      `SELECT v.id, v.unit_id AS "unitId", u.external_id AS "externalId", v.hash, v.data, v.created
       FROM unit_versions v JOIN units u ON u.id = v.unit_id
       WHERE v.job_id = $1 AND v.id > $2 ORDER BY v.id LIMIT $3`,
      [c.get("jobId"), after ?? 0, limit + 1],
    );
    const page = rows.slice(0, limit);
    return c.json({ versions: page, next: rows.length > limit ? page[page.length - 1].id : null });
  });

  return app;
}
