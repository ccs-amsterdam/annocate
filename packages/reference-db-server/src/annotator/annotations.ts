import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { AnnotatorAnnotationBatchSchema, type AnnotatorAnnotation, type VariableValue } from "@annotinder/contracts";
import { transaction } from "../db.js";
import type { Env, Server } from "../context.js";
import { parseBody } from "../shared/http.js";
import { unitHash } from "../shared/units.js";

/**
 * `GET /annotator/job/:jobId/annotations?coderId=X` (docs/api/annotator.md#listannotations).
 * One coder's live values per unit, ordered by first write. Coder-level
 * values are not included: they come with the coder.
 *
 * `POST /annotator/job/:jobId/annotations` (docs/api/annotator.md#putannotations).
 * The job server's buffered writes, applied in order: upsert a live value
 * per given variable, leave other variables alone. Writes for unknown units
 * or coders are skipped and reported, so they don't block the rest.
 */
export function annotations(server: Server): Hono<Env> {
  const app = new Hono<Env>();

  app.get("/", (c) => {
    const coderId = Number(c.req.query("coderId"));
    if (!Number.isInteger(coderId) || coderId <= 0) return c.json({ error: "coderId is required" }, 400);
    return c.json(listCoderAnnotations(server.db, c.get("jobId"), coderId));
  });

  app.post("/", async (c) => {
    const body = await parseBody(c, AnnotatorAnnotationBatchSchema);
    if (!("data" in body)) return c.json({ error: body.error }, 400);

    const jobId = c.get("jobId");
    const unitExists = server.db.prepare("SELECT 1 FROM units WHERE jobId = ? AND id = ?");
    const coderExists = server.db.prepare("SELECT 1 FROM coders WHERE jobId = ? AND id = ?");
    const rejected: { index: number; error: string }[] = [];
    transaction(server.db, () => {
      body.data.annotations.forEach((a, index) => {
        if (!unitExists.get(jobId, a.unitId)) return rejected.push({ index, error: "Unit not found" });
        if (!coderExists.get(jobId, a.coderId)) return rejected.push({ index, error: "Coder not found" });
        putAnnotation(server.db, jobId, a.unitId, a.coderId, a.variables, a.codebookId, a.unitHash);
      });
    });
    return c.json({ rejected });
  });

  return app;
}

interface ValueRow {
  unitId: number;
  coderId: number;
  variable: string;
  value: string;
  created: string;
  updated: string;
}

/** One coder's live annotations per unit, ordered by first write (the job server's per-coder workspace). */
function listCoderAnnotations(db: DatabaseSync, jobId: number, coderId: number): AnnotatorAnnotation[] {
  const rows = db
    .prepare(
      `SELECT unitId, coderId, variable, value, created, updated FROM annotation_values
       WHERE jobId = ? AND coderId = ? AND retiredAt IS NULL ORDER BY created, id`,
    )
    .all(jobId, coderId) as unknown as ValueRow[];
  const byUnit = new Map<number, AnnotatorAnnotation>();
  for (const row of rows) {
    let annotation = byUnit.get(row.unitId);
    if (!annotation) {
      annotation = {
        unitId: row.unitId,
        coderId: row.coderId,
        variables: {},
        created: new Date(row.created),
        updated: new Date(row.updated),
      };
      byUnit.set(row.unitId, annotation);
    }
    annotation.variables[row.variable] = JSON.parse(row.value);
    if (new Date(row.updated) > annotation.updated) annotation.updated = new Date(row.updated);
  }
  return [...byUnit.values()];
}

/**
 * Upserts a live value per given variable; variables not given are left
 * alone (so values from older codebook versions stay). `created` is kept on
 * update. Also marks the unit immutable.
 */
function putAnnotation(
  db: DatabaseSync,
  jobId: number,
  unitId: number,
  coderId: number,
  variables: Record<string, VariableValue>,
  codebookId?: number,
  shownHash?: string,
): void {
  const now = new Date().toISOString();
  // Record what the coder was shown only if it isn't the current content.
  const unit = db.prepare("SELECT externalId, data FROM units WHERE jobId = ? AND id = ?").get(jobId, unitId) as
    | { externalId: string; data: string }
    | undefined;
  const stale = shownHash !== undefined && unit !== undefined && shownHash !== unitHash(unit.externalId, unit.data);
  const upsert = db.prepare(
    `INSERT INTO annotation_values (jobId, unitId, coderId, variable, value, codebookId, unitHash, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (unitId, coderId, variable) WHERE retiredAt IS NULL
     DO UPDATE SET value = excluded.value, codebookId = excluded.codebookId, unitHash = excluded.unitHash,
       updated = excluded.updated`,
  );
  for (const [variable, value] of Object.entries(variables)) {
    upsert.run(jobId, unitId, coderId, variable, JSON.stringify(value), codebookId ?? null, stale ? shownHash : null, now, now);
  }
  db.prepare("UPDATE units SET immutable = 1 WHERE jobId = ? AND id = ?").run(jobId, unitId);
}
