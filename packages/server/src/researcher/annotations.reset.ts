import { Hono } from "hono";
import { ResetAnnotationsSchema, type ResetAnnotations } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import type { Sql } from "../db.js";

// Reset: retire the live values of these variables (e.g. a loop's
// questions), so the units are coded again. Nothing is deleted.
export function annotationsReset(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post("/job/:jobId/annotations/reset", requireJobUser(server, "ADMIN"), async (c) => {
    const parsed = ResetAnnotationsSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const retired = await db.transaction((tx) => retireAnnotations(tx, jobId, parsed.data));
    await server.deployments.refresh(jobId);
    return c.json({ retired });
  });

  return app;
}

async function retireAnnotations(sql: Sql, jobId: number, request: ResetAnnotations): Promise<number> {
  const retired = await sql.query(
    `UPDATE annotation_values SET retired_at = now()
     WHERE job_id = $1 AND retired_at IS NULL AND variable = ANY($2)
       AND ($3::int[] IS NULL OR unit_id = ANY($3)) AND ($4::int[] IS NULL OR coder_id = ANY($4))
     RETURNING id`,
    [jobId, request.variables, request.unitIds?.length ? request.unitIds : null, request.coderIds?.length ? request.coderIds : null],
  );
  await sql.query("UPDATE deployments SET annotation_epoch = annotation_epoch + 1 WHERE job_id = $1", [jobId]);
  return retired.length;
}
