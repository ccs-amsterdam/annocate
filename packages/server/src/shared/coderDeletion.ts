import type { CoderDeletion, DeleteCoders, DeleteCodersResponse } from "@annotinder/contracts";
import type { Sql } from "../db.js";

/**
 * Deletes coders and everything they answered, for good (a participant
 * withdrew, docs/coder-identity.md): the coders (with their coder-level
 * answers, routing and deletion request) and all their answer rows, also
 * retired ones. Selected by id, participant id or email, within the job.
 * Units nobody has answers for any more can be deleted again. Unit
 * versions stay: they hold unit content, not the coder's. Each deleted coder
 * is logged (`coder_deletions`), with the ids downloaded results use.
 */
export async function deleteCoders(sql: Sql, jobId: number, select: DeleteCoders, deletedBy: string | null): Promise<DeleteCodersResponse> {
  return sql.transaction(async (tx) => {
    const coders = await tx.query<{ id: number }>(
      `SELECT id FROM coders WHERE job_id = $1 AND (id = ANY($2) OR participant_id = ANY($3) OR lower(email) = ANY($4))`,
      [jobId, select.coderIds ?? [], select.participantIds ?? [], (select.emails ?? []).map((e) => e.toLowerCase())],
    );
    const ids = coders.map((c) => c.id);
    if (ids.length === 0) return { coderIds: [], answers: 0 };
    await tx.query(
      `INSERT INTO coder_deletions (job_id, coder_id, participant_id, email, requested_at, deleted_by, answers)
       SELECT c.job_id, c.id, c.participant_id, c.email, (c.deletion_request->>'at')::timestamptz, $3,
              (SELECT count(*)::int FROM annotation_values a WHERE a.job_id = c.job_id AND a.coder_id = c.id)
       FROM coders c WHERE c.job_id = $1 AND c.id = ANY($2)`,
      [jobId, ids, deletedBy],
    );
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

/** Deletes later: the request stays, marked postponed, and is no longer brought up. Returns false if there is none. */
export async function postponeDeletion(sql: Sql, jobId: number, coderId: number): Promise<boolean> {
  const rows = await sql.query(
    `UPDATE coders SET deletion_request = deletion_request || jsonb_build_object('postponedAt', now())
     WHERE job_id = $1 AND id = $2 AND deletion_request IS NOT NULL RETURNING id`,
    [jobId, coderId],
  );
  return rows.length > 0;
}

/** The job's deletion log, newest first. */
export async function listCoderDeletions(sql: Sql, jobId: number): Promise<CoderDeletion[]> {
  return sql.query<CoderDeletion>(
    `SELECT coder_id AS "coderId", participant_id AS "participantId", email, requested_at AS "requestedAt",
            deleted_at AS "deletedAt", deleted_by AS "deletedBy", answers
     FROM coder_deletions WHERE job_id = $1 ORDER BY deleted_at DESC, id DESC`,
    [jobId],
  );
}
