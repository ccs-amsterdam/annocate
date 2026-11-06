import type { CoderStudy, SessionEnd } from "@annotinder/contracts";
import type { Sql } from "../db.js";

/**
 * Coders' sessions as studies for the annotator's home (contracts
 * `CoderStudySchema`): the job's name, when the session started and was
 * last active, how it ended, and the units answered. Only jobs that are
 * deployed and not suspended.
 */
export async function coderStudies(sql: Sql, where: string, params: unknown[]): Promise<CoderStudy[]> {
  const rows = await sql.query<{ job_id: number; name: string; created: Date; ended: SessionEnd | null; units: number; last_active: Date | null }>(
    `SELECT c.job_id, j.name, c.created, c.ended,
       (SELECT count(DISTINCT a.unit_id)::int FROM annotation_values a WHERE a.coder_id = c.id AND a.unit_id IS NOT NULL AND a.retired_at IS NULL) AS units,
       (SELECT max(a.updated) FROM annotation_values a WHERE a.coder_id = c.id) AS last_active
     FROM coders c JOIN jobs j ON j.id = c.job_id JOIN deployments d ON d.job_id = c.job_id
     WHERE j.suspended_at IS NULL AND ${where}
     ORDER BY COALESCE((SELECT max(a.updated) FROM annotation_values a WHERE a.coder_id = c.id), c.created) DESC`,
    params,
  );
  return rows.map((r) => ({
    deployment: String(r.job_id),
    name: r.name,
    started: r.created,
    lastActive: r.last_active && r.last_active > r.created ? r.last_active : r.created,
    ended: r.ended?.outcome ?? null,
    units: r.units,
  }));
}
