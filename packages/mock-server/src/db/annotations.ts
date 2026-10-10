import type { DatabaseSync } from "node:sqlite";
import type { VariableValue } from "@annotinder/contracts";

// One coder's variables for one unit. Shared by the legacy coder routes
// (routes/session.ts) and the backend API the job server writes through
// (routes/backend.ts), so both paths see the same annotations.

export interface AnnotationRow {
  jobId: number;
  unitId: number;
  coderId: number;
  variables: string;
  updated: string;
  codebookId: number | null;
}

interface UnitsetRow {
  name: string;
  unitIds: string;
}

export function getAnnotation(
  db: DatabaseSync,
  unitId: number,
  coderId: number,
): Record<string, VariableValue> | undefined {
  const row = db.prepare("SELECT variables FROM annotations WHERE unitId = ? AND coderId = ?").get(unitId, coderId) as
    | { variables: string }
    | undefined;
  return row ? JSON.parse(row.variables) : undefined;
}

export function listAnnotations(db: DatabaseSync, jobId: number): AnnotationRow[] {
  return db
    .prepare("SELECT * FROM annotations WHERE jobId = ? ORDER BY updated, rowid")
    .all(jobId) as unknown as AnnotationRow[];
}

/**
 * Upserts an annotation, marks the unit immutable, and -- if every variable
 * is done -- records the unit as done for this coder in the per-unitset
 * progress lists (used by `GET /session` and `GET /coders`).
 */
export function putAnnotation(
  db: DatabaseSync,
  jobId: number,
  unitId: number,
  coderId: number,
  variables: Record<string, VariableValue>,
  codebookId?: number,
): void {
  db.prepare(
    `INSERT INTO annotations (jobId, unitId, coderId, variables, updated, codebookId) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (unitId, coderId) DO UPDATE SET variables = excluded.variables, updated = excluded.updated,
       codebookId = excluded.codebookId`,
  ).run(jobId, unitId, coderId, JSON.stringify(variables), new Date().toISOString(), codebookId ?? null);
  db.prepare("UPDATE units SET immutable = 1 WHERE jobId = ? AND id = ?").run(jobId, unitId);

  const allDone = Object.values(variables).every((v) => v.done);
  if (!allDone) return;

  const coder = db.prepare("SELECT doneUnitIds FROM coders WHERE id = ?").get(coderId) as
    | { doneUnitIds: string }
    | undefined;
  if (!coder) return;
  const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
  const markDone = (key: string) => {
    const done = doneUnitIds[key] ?? [];
    if (!done.includes(unitId)) doneUnitIds[key] = [...done, unitId];
  };
  markDone("__all__");
  const unitsets = db.prepare("SELECT name, unitIds FROM unitsets WHERE jobId = ?").all(jobId) as unknown as UnitsetRow[];
  for (const unitset of unitsets) {
    if ((JSON.parse(unitset.unitIds) as number[]).includes(unitId)) markDone(unitset.name);
  }
  db.prepare("UPDATE coders SET doneUnitIds = ? WHERE id = ?").run(JSON.stringify(doneUnitIds), coderId);
}
