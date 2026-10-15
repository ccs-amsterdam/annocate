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
  done: number;
  doneAt: string | null;
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

/** One coder's annotations (finished or not), for the job server's per-coder cache. */
export function listCoderAnnotations(db: DatabaseSync, jobId: number, coderId: number): AnnotationRow[] {
  return db
    .prepare("SELECT * FROM annotations WHERE jobId = ? AND coderId = ? ORDER BY rowid")
    .all(jobId, coderId) as unknown as AnnotationRow[];
}

/** All finished annotations of a job, in the order they were first finished. */
export function listDoneAnnotations(db: DatabaseSync, jobId: number): AnnotationRow[] {
  return db
    .prepare("SELECT * FROM annotations WHERE jobId = ? AND done = 1 ORDER BY doneAt, rowid")
    .all(jobId) as unknown as AnnotationRow[];
}

/**
 * Upserts an annotation, marks the unit immutable, and -- if it is done --
 * records the unit as done for this coder in the per-unitset progress lists
 * (used by the legacy `GET /session` and `GET /coders`). `done` is decided by
 * the caller; `doneAt` is set the first time it is true and then kept, so
 * editing a finished unit doesn't change its place in the coder's progress.
 */
export function putAnnotation(
  db: DatabaseSync,
  jobId: number,
  unitId: number,
  coderId: number,
  variables: Record<string, VariableValue>,
  done: boolean,
  codebookId?: number,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO annotations (jobId, unitId, coderId, variables, updated, codebookId, done, doneAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (unitId, coderId) DO UPDATE SET variables = excluded.variables, updated = excluded.updated,
       codebookId = excluded.codebookId, done = excluded.done, doneAt = COALESCE(annotations.doneAt, excluded.doneAt)`,
  ).run(jobId, unitId, coderId, JSON.stringify(variables), now, codebookId ?? null, done ? 1 : 0, done ? now : null);
  db.prepare("UPDATE units SET immutable = 1 WHERE jobId = ? AND id = ?").run(jobId, unitId);

  if (!done) return;

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
