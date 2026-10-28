import type { VariableValue } from "@annotinder/contracts";
import type { Sql } from "../db.js";
import type { Finished, FinishedRequest } from "../runtime/types.js";
import { coderValues } from "./coders.js";

/**
 * What coders finished, per group of variables (usually a unit loop's
 * questions): the (unit, coder) pairs where *every* variable has a live
 * value, oldest first. Coder-level groups: the coders that have all of them.
 * Only filters; which variables make up a loop is the runtime's business
 * (it reads the codebook).
 *
 * Used by the runtime (runtime/store.ts) and when publishing (to warn about
 * loops that gained questions).
 */
export async function listFinished(sql: Sql, jobId: number, request: FinishedRequest): Promise<Finished[]> {
  const result: Finished[] = [];
  // $3 is the coder, or NULL for all coders.
  const coderId = request.coderId ?? null;

  for (const group of request.loops) {
    if (group.level === "coder") {
      result.push(...(await listFinishedCoders(sql, jobId, group, request.coderId)));
      continue;
    }
    const variables = [...new Set(group.variables)];
    const finished = await sql.query<{ unitId: number; coderId: number; created: Date }>(
      `SELECT unit_id AS "unitId", coder_id AS "coderId", MIN(created) AS created FROM annotation_values
       WHERE job_id = $1 AND unit_id IS NOT NULL AND retired_at IS NULL AND variable = ANY($2) AND ($3::int IS NULL OR coder_id = $3)
       GROUP BY unit_id, coder_id HAVING COUNT(*) = $4
       ORDER BY created, unit_id`,
      [jobId, variables, coderId, variables.length],
    );

    // The values of e.g. agreement variables come along, for the finished units only.
    const wanted = [...new Set(group.values ?? [])];
    const values = new Map<string, Record<string, VariableValue>>();
    if (wanted.length > 0) {
      const rows = await sql.query<{ unitId: number; coderId: number; variable: string; value: VariableValue }>(
        `SELECT unit_id AS "unitId", coder_id AS "coderId", variable, value FROM annotation_values
         WHERE job_id = $1 AND unit_id IS NOT NULL AND retired_at IS NULL AND variable = ANY($2) AND ($3::int IS NULL OR coder_id = $3)`,
        [jobId, wanted, coderId],
      );
      for (const row of rows) {
        const key = `${row.unitId}/${row.coderId}`;
        values.set(key, { ...values.get(key), [row.variable]: row.value });
      }
    }

    for (const row of finished) {
      result.push({
        loop: group.loop,
        unitId: row.unitId,
        coderId: row.coderId,
        created: row.created,
        ...(wanted.length > 0 ? { values: values.get(`${row.unitId}/${row.coderId}`) ?? {} } : {}),
      });
    }
  }
  return result;
}

/** Coder-level groups: the coders whose answer rows without a unit include all of the group's variables. */
async function listFinishedCoders(
  sql: Sql,
  jobId: number,
  group: FinishedRequest["loops"][number],
  coderId: number | undefined,
): Promise<Finished[]> {
  const coders = await sql.query<{ id: number; created: Date }>(
    "SELECT id, created FROM coders WHERE job_id = $1 AND ($2::int IS NULL OR id = $2) ORDER BY id",
    [jobId, coderId ?? null],
  );
  const values = await coderValues(sql, jobId, coderId);
  const result: Finished[] = [];
  for (const coder of coders) {
    const own = values.get(coder.id) ?? {};
    if (!group.variables.every((v) => v in own)) continue;
    result.push({
      loop: group.loop,
      unitId: null,
      coderId: coder.id,
      created: coder.created,
      ...(group.values?.length ? { values: Object.fromEntries(group.values.filter((v) => v in own).map((v) => [v, own[v]])) } : {}),
    });
  }
  return result;
}
