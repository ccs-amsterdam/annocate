import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { ResetAnnotationsSchema, type ResetAnnotations } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { placeholders } from "../db.js";

// Reset: retire the live values of these variables (e.g. a loop's
// questions), so the units are coded again. Nothing is deleted.
export function annotationsReset(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post("/job/:jobId/annotations/reset", requireJobUser(db, "ADMIN"), async (c) => {
    const parsed = ResetAnnotationsSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const retired = retireAnnotations(db, jobId, parsed.data);
    await server.deployments.refresh(jobId);
    return c.json({ retired });
  });

  return app;
}

function retireAnnotations(db: DatabaseSync, jobId: number, request: ResetAnnotations): number {
  const conditions = [`jobId = ?`, `retiredAt IS NULL`, `variable IN (${placeholders(request.variables.length)})`];
  const args: (number | string)[] = [jobId, ...request.variables];
  if (request.unitIds?.length) {
    conditions.push(`unitId IN (${placeholders(request.unitIds.length)})`);
    args.push(...request.unitIds);
  }
  if (request.coderIds?.length) {
    conditions.push(`coderId IN (${placeholders(request.coderIds.length)})`);
    args.push(...request.coderIds);
  }
  const result = db
    .prepare(`UPDATE annotation_values SET retiredAt = ? WHERE ${conditions.join(" AND ")}`)
    .run(new Date().toISOString(), ...args);
  db.prepare("UPDATE deployments SET annotationEpoch = annotationEpoch + 1 WHERE jobId = ?").run(jobId);
  return Number(result.changes);
}
