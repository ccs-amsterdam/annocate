import type { DeleteCoders, DeleteCodersResponse } from "@annotinder/contracts";
import type { Sql } from "../db.js";

/**
 * Deletes coders and everything they answered, for good (a participant
 * withdrew, docs/coder-identity.md): the coders (with their coder-level
 * answers, routing and deletion request) and all their answer rows, also
 * retired ones. Selected by id, participant id or email, within the job.
 * Units nobody has answers for any more can be deleted again. Unit
 * versions stay: they hold unit content, not the coder's.
 */
export async function deleteCoders(sql: Sql, jobId: number, select: DeleteCoders): Promise<DeleteCodersResponse> {
  return sql.transaction(async (tx) => {
    const coders = await tx.query<{ id: number }>(
      `SELECT id FROM coders WHERE job_id = $1 AND (id = ANY($2) OR participant_id = ANY($3) OR lower(email) = ANY($4))`,
      [jobId, select.coderIds ?? [], select.participantIds ?? [], (select.emails ?? []).map((e) => e.toLowerCase())],
    );
    const ids = coders.map((c) => c.id);
    if (ids.length === 0) return { coderIds: [], answers: 0 };
    const removed = await tx.query<{ unitId: number }>(
      `DELETE FROM annotation_values WHERE job_id = $1 AND coder_id = ANY($2) RETURNING unit_id AS "unitId"`,
      [jobId, ids],
    );
    await tx.query("DELETE FROM coders WHERE job_id = $1 AND id = ANY($2)", [jobId, ids]);
    const units = [...new Set(removed.map((r) => r.unitId))];
    await tx.query(
      `UPDATE units u SET coded = EXISTS (SELECT 1 FROM annotation_values a WHERE a.unit_id = u.id) WHERE u.job_id = $1 AND u.id = ANY($2)`,
      [jobId, units],
    );
    return { coderIds: ids, answers: removed.length };
  });
}

/** Declines a coder's request to delete their answers: it stays on record, marked declined. Returns false if there is none. */
export async function declineDeletion(sql: Sql, jobId: number, coderId: number): Promise<boolean> {
  const rows = await sql.query(
    `UPDATE coders SET deletion_request = deletion_request || jsonb_build_object('declinedAt', now())
     WHERE job_id = $1 AND id = $2 AND deletion_request IS NOT NULL RETURNING id`,
    [jobId, coderId],
  );
  return rows.length > 0;
}
