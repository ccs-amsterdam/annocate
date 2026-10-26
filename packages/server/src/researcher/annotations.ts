import { Hono } from "hono";
import { AnnotationsQuerySchema, type AnnotationRow } from "@annotinder/contracts";
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
         a.unit_hash AS "unitHash", a.created, a.updated, a.retired_at AS "retiredAt"
       FROM annotation_values a
       JOIN units u ON u.id = a.unit_id
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

  return app;
}
