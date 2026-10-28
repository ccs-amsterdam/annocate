import type { DeletionRequest, SessionEnd, VariableValue } from "@annotinder/contracts";
import type { Coder, CoderAssignments } from "../runtime/types.js";
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

/**
 * A coder as the runtime sees it: no identifying data, except the email the
 * coder linked themselves. `variables`: their coder-level values (answer
 * rows without a unit, `coderValues`).
 */
export function toCoder(row: CoderRow, variables: Record<string, VariableValue>): Coder {
  return {
    coderId: row.id,
    variables,
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

/** Writes coder-level values: a row each, without a unit (`assigned`: by the server, not answered). */
export async function putCoderValues(
  sql: Sql,
  jobId: number,
  write: { coderId: number; values: Record<string, VariableValue>; assigned?: boolean; codebookId?: number | null; deviceId?: number | null },
): Promise<void> {
  for (const [variable, value] of Object.entries(write.values)) {
    await sql.query(
      `INSERT INTO annotation_values (job_id, unit_id, coder_id, variable, value, codebook_id, device_id, assigned, created, updated)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (coder_id, variable) WHERE retired_at IS NULL AND unit_id IS NULL
       DO UPDATE SET value = excluded.value, codebook_id = excluded.codebook_id, device_id = excluded.device_id, updated = excluded.updated`,
      [jobId, write.coderId, variable, JSON.stringify(value), write.codebookId ?? null, write.deviceId ?? null, write.assigned ?? false],
    );
  }
}
