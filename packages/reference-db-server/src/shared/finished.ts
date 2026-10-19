import type { DatabaseSync } from "node:sqlite";
import type { AnnotatorFinished, FinishedRequest, VariableValue } from "@annotinder/contracts";
import { placeholders } from "../db.js";

/**
 * What coders finished, per group of variables (usually a unit loop's
 * questions): the (unit, coder) pairs where *every* variable has a live
 * value, oldest first. Coder-level groups: the coders that have all of them.
 * The db server only filters; which variables make up a loop is the job
 * server's business (it reads the codebook).
 *
 * Used by the annotator API (`POST /finished`) and when publishing (to warn
 * about loops that gained questions).
 */
export function listFinished(db: DatabaseSync, jobId: number, request: FinishedRequest): AnnotatorFinished[] {
  const result: AnnotatorFinished[] = [];
  const coderFilter = request.coderId !== undefined ? " AND coderId = ?" : "";
  const coderArg = request.coderId !== undefined ? [request.coderId] : [];

  for (const group of request.loops) {
    if (group.level === "coder") {
      result.push(...listFinishedCoders(db, jobId, group, request.coderId));
      continue;
    }
    const variables = [...new Set(group.variables)];
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

    // The values of e.g. agreement variables come along, for the finished units only.
    const wanted = [...new Set(group.values ?? [])];
    const values = new Map<string, Record<string, VariableValue>>();
    if (wanted.length > 0) {
      const rows = db
        .prepare(
          `SELECT unitId, coderId, variable, value FROM annotation_values
           WHERE jobId = ? AND retiredAt IS NULL AND variable IN (${placeholders(wanted.length)})${coderFilter}`,
        )
        .all(jobId, ...wanted, ...coderArg) as unknown as { unitId: number; coderId: number; variable: string; value: string }[];
      for (const row of rows) {
        const key = `${row.unitId}/${row.coderId}`;
        values.set(key, { ...values.get(key), [row.variable]: JSON.parse(row.value) });
      }
    }

    for (const row of finished) {
      result.push({
        loop: group.loop,
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
 * Coder-level groups. This server keeps coder-level values on the coder
 * (`coders.variables`) rather than as annotation rows without a unit, so
 * they are filtered here; both are fine (CONTRACTS.md).
 */
function listFinishedCoders(
  db: DatabaseSync,
  jobId: number,
  group: FinishedRequest["loops"][number],
  coderId: number | undefined,
): AnnotatorFinished[] {
  const rows = db
    .prepare(`SELECT id, variables, created FROM coders WHERE jobId = ?${coderId !== undefined ? " AND id = ?" : ""} ORDER BY id`)
    .all(jobId, ...(coderId !== undefined ? [coderId] : [])) as unknown as { id: number; variables: string; created: string }[];
  const result: AnnotatorFinished[] = [];
  for (const row of rows) {
    const variables = JSON.parse(row.variables) as Record<string, VariableValue>;
    if (!group.variables.every((v) => v in variables)) continue;
    result.push({
      loop: group.loop,
      unitId: null,
      coderId: row.id,
      created: new Date(row.created),
      ...(group.values?.length
        ? { values: Object.fromEntries(group.values.filter((v) => v in variables).map((v) => [v, variables[v]])) }
        : {}),
    });
  }
  return result;
}
