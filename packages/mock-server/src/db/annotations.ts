import type { DatabaseSync } from "node:sqlite";
import type {
  BackendAnnotation,
  BackendFinished,
  FinishedRequest,
  ResetAnnotations,
  VariableValue,
} from "@annotinder/contracts";

// Annotations, one row per (unit, coder, variable) in `annotation_values`.
// Rows are retired, never deleted; only live rows (retiredAt IS NULL) count.
// Shared by the legacy coder routes (routes/session.ts) and the backend API
// the job server writes through (routes/backend.ts).

interface ValueRow {
  unitId: number;
  coderId: number;
  variable: string;
  value: string;
  created: string;
  updated: string;
}

interface UnitsetRow {
  name: string;
  unitIds: string;
}

const placeholders = (n: number) => Array(n).fill("?").join(",");

/** A coder's live values for one unit. */
export function getAnnotation(
  db: DatabaseSync,
  unitId: number,
  coderId: number,
): Record<string, VariableValue> | undefined {
  const rows = db
    .prepare("SELECT variable, value FROM annotation_values WHERE unitId = ? AND coderId = ? AND retiredAt IS NULL")
    .all(unitId, coderId) as unknown as { variable: string; value: string }[];
  if (rows.length === 0) return undefined;
  return Object.fromEntries(rows.map((r) => [r.variable, JSON.parse(r.value)]));
}

/** One coder's live annotations per unit, ordered by first write (the job server's per-coder workspace). */
export function listCoderAnnotations(db: DatabaseSync, jobId: number, coderId: number): BackendAnnotation[] {
  const rows = db
    .prepare(
      `SELECT unitId, coderId, variable, value, created, updated FROM annotation_values
       WHERE jobId = ? AND coderId = ? AND retiredAt IS NULL ORDER BY created, id`,
    )
    .all(jobId, coderId) as unknown as ValueRow[];
  const byUnit = new Map<number, BackendAnnotation>();
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
 * Units coders finished per loop: those where *every* given variable has a
 * live value. The db server only counts; which variables make up a loop is
 * the job server's business (it reads the codebook).
 */
export function listFinished(db: DatabaseSync, jobId: number, request: FinishedRequest): BackendFinished[] {
  const result: BackendFinished[] = [];
  const coderFilter = request.coderId !== undefined ? " AND coderId = ?" : "";
  const coderArg = request.coderId !== undefined ? [request.coderId] : [];

  for (const { loop, variables: given, values: valueVariables } of request.loops) {
    const variables = [...new Set(given)];
    const finished = db
      .prepare(
        `SELECT unitId, coderId, MIN(created) AS created FROM annotation_values
         WHERE jobId = ? AND retiredAt IS NULL AND variable IN (${placeholders(variables.length)})${coderFilter}
         GROUP BY unitId, coderId HAVING COUNT(*) = ?
         ORDER BY created, unitId`,
      )
      .all(jobId, ...variables, ...coderArg, variables.length) as unknown as {
      unitId: number;
      coderId: number;
      created: string;
    }[];

    // Values of e.g. agreement variables, for the finished units only.
    const values = new Map<string, Record<string, VariableValue>>();
    const wanted = [...new Set(valueVariables ?? [])];
    if (wanted.length > 0) {
      const rows = db
        .prepare(
          `SELECT unitId, coderId, variable, value FROM annotation_values
           WHERE jobId = ? AND retiredAt IS NULL AND variable IN (${placeholders(wanted.length)})${coderFilter}`,
        )
        .all(jobId, ...wanted, ...coderArg) as unknown as ValueRow[];
      for (const row of rows) {
        const key = `${row.unitId}/${row.coderId}`;
        values.set(key, { ...values.get(key), [row.variable]: JSON.parse(row.value) });
      }
    }

    for (const row of finished) {
      result.push({
        loop,
        unitId: row.unitId,
        coderId: row.coderId,
        created: new Date(row.created),
        ...(wanted.length > 0 ? { values: values.get(`${row.unitId}/${row.coderId}`) ?? {} } : {}),
      });
    }
  }
  return result;
}

/**
 * Upserts a live value per given variable; variables not given are left
 * alone (so values from older codebook versions stay). `created` is kept on
 * update. Also marks the unit immutable, and -- for the legacy coder routes
 * and `GET /coders` -- records it as done when every given value is done.
 */
export function putAnnotation(
  db: DatabaseSync,
  jobId: number,
  unitId: number,
  coderId: number,
  variables: Record<string, VariableValue>,
  codebookId?: number,
): void {
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO annotation_values (jobId, unitId, coderId, variable, value, codebookId, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (unitId, coderId, variable) WHERE retiredAt IS NULL
     DO UPDATE SET value = excluded.value, codebookId = excluded.codebookId, updated = excluded.updated`,
  );
  for (const [variable, value] of Object.entries(variables)) {
    upsert.run(jobId, unitId, coderId, variable, JSON.stringify(value), codebookId ?? null, now, now);
  }
  db.prepare("UPDATE units SET immutable = 1 WHERE jobId = ? AND id = ?").run(jobId, unitId);

  const values = Object.values(variables);
  if (values.length > 0 && values.every((v) => v.done)) markDone(db, jobId, unitId, coderId);
}

/**
 * Retires live values (a researcher "reset"): they stay for analysis, but no
 * longer count, so the units are unfinished again. Bumps the deployment's
 * `annotationEpoch` so the job server reloads. Returns the number retired.
 */
export function retireAnnotations(db: DatabaseSync, jobId: number, request: ResetAnnotations): number {
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

/** Legacy per-unitset progress lists (`coders.doneUnitIds`), used by the legacy routes and `GET /coders`. */
function markDone(db: DatabaseSync, jobId: number, unitId: number, coderId: number): void {
  const coder = db.prepare("SELECT doneUnitIds FROM coders WHERE id = ?").get(coderId) as
    | { doneUnitIds: string }
    | undefined;
  if (!coder) return;
  const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
  const mark = (key: string) => {
    const done = doneUnitIds[key] ?? [];
    if (!done.includes(unitId)) doneUnitIds[key] = [...done, unitId];
  };
  mark("__all__");
  const unitsets = db.prepare("SELECT name, unitIds FROM unitsets WHERE jobId = ?").all(jobId) as unknown as UnitsetRow[];
  for (const unitset of unitsets) {
    if ((JSON.parse(unitset.unitIds) as number[]).includes(unitId)) mark(unitset.name);
  }
  db.prepare("UPDATE coders SET doneUnitIds = ? WHERE id = ?").run(JSON.stringify(doneUnitIds), coderId);
}
