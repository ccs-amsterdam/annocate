import type { DeletionRequest, SessionEnd, VariableValue } from "@annotinder/contracts";
import type { Coder, CoderAssignments, CoderValue, CoderValuesWrite } from "../runtime/types.js";
import type { Sql } from "../db.js";

/** A row of `coders`. */
export interface CoderRow {
  id: number;
  job_id: number;
  email: string | null;
  participant_id: string | null;
  invite_id: number | null;
  assignments: CoderAssignments;
  ended: SessionEnd | null;
  deletion_request: DeletionRequest | null;
  session: Record<string, string>;
  created: Date;
}

/** A coder as the runtime sees it: no identifying data, except the email the coder linked themselves. */
export function toCoder(row: CoderRow): Coder {
  return {
    coderId: row.id,
    assignments: row.assignments ?? {},
    ended: row.ended,
    deletionRequest: row.deletion_request,
    session: { ...row.session, ...(row.participant_id ? { participant: row.participant_id } : {}) },
    inviteId: row.invite_id,
    email: row.email,
  };
}

/** Coder-level values (answers outside unit loops, and assigned values): the live answer rows without a unit, per coder. */
export async function coderValues(sql: Sql, jobId: number, coderId?: number): Promise<Map<number, Record<string, VariableValue>>> {
  const rows = await sql.query<{ coderId: number; variable: string; value: VariableValue }>(
    `SELECT coder_id AS "coderId", variable, value FROM annotation_values
     WHERE job_id = $1 AND unit_id IS NULL AND retired_at IS NULL AND ($2::int IS NULL OR coder_id = $2) ORDER BY id`,
    [jobId, coderId ?? null],
  );
  const byCoder = new Map<number, Record<string, VariableValue>>();
  for (const row of rows) {
    let values = byCoder.get(row.coderId);
    if (!values) byCoder.set(row.coderId, (values = {}));
    values[row.variable] = row.value;
  }
  return byCoder;
}

/** One coder's live coder-level answers, with whether they can still change. */
export async function coderAnswers(sql: Sql, jobId: number, coderId: number): Promise<Record<string, CoderValue>> {
  const rows = await sql.query<{ variable: string } & CoderValue>(
    `SELECT variable, value, assigned, frozen FROM annotation_values
     WHERE job_id = $1 AND coder_id = $2 AND unit_id IS NULL AND retired_at IS NULL`,
    [jobId, coderId],
  );
  return Object.fromEntries(rows.map(({ variable, ...rest }) => [variable, rest]));
}

/**
 * Writes coder-level values: a row each, without a unit (`assigned`: by the
 * server, not answered), with their timings (`CoderValuesWrite.timings`).
 * Assigned and frozen answers are left as they are.
 */
export async function putCoderValues(sql: Sql, jobId: number, write: CoderValuesWrite): Promise<void> {
  const timing = (variable: string) => {
    const t = write.timings?.[variable];
    return t ? JSON.stringify(t) : null;
  };
  for (const [variable, value] of Object.entries(write.values)) {
    await sql.query(
      `INSERT INTO annotation_values (job_id, unit_id, coder_id, variable, value, codebook_id, device_id, assigned, timing, created, updated)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, now(), now())
       ON CONFLICT (coder_id, variable) WHERE retired_at IS NULL AND unit_id IS NULL
       DO UPDATE SET value = excluded.value, codebook_id = excluded.codebook_id, device_id = excluded.device_id,
         timing = excluded.timing, updated = excluded.updated
       WHERE NOT annotation_values.assigned AND NOT annotation_values.frozen`,
      [jobId, write.coderId, variable, JSON.stringify(value), write.codebookId ?? null, write.deviceId ?? null, write.assigned ?? false, timing(variable)],
    );
  }
  for (const variable of Object.keys(write.timings ?? {})) {
    if (variable in write.values) continue;
    await sql.query(
      `UPDATE annotation_values SET timing = $4
       WHERE job_id = $1 AND coder_id = $2 AND variable = $3 AND unit_id IS NULL AND retired_at IS NULL AND NOT assigned`,
      [jobId, write.coderId, variable, timing(variable)],
    );
  }
}
