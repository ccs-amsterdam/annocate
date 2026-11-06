import type { CoderStudy, SessionEnd } from "@annotinder/contracts";
import type { Sql } from "../db.js";

/**
 * Coders' sessions as studies for the annotator's home (contracts
 * `CoderStudySchema`): the deployed design's public title (never the
 * job's name: that is private), when the session started and was
 * last active, how it ended, and the units answered. Only jobs that are
 * deployed and not suspended.
 */
export async function coderStudies(sql: Sql, where: string, params: unknown[]): Promise<CoderStudy[]> {
  const rows = await sql.query<{ job_id: number; title: string | null; created: Date; ended: SessionEnd | null; units: number; last_active: Date | null }>(
    `SELECT c.job_id, dv.session->'public'->>'title' AS title, c.created, c.ended,
       (SELECT count(DISTINCT a.unit_id)::int FROM annotation_values a WHERE a.coder_id = c.id AND a.unit_id IS NOT NULL AND a.retired_at IS NULL) AS units,
       (SELECT max(a.updated) FROM annotation_values a WHERE a.coder_id = c.id) AS last_active
     FROM coders c JOIN jobs j ON j.id = c.job_id JOIN deployments d ON d.job_id = c.job_id
       JOIN design_versions dv ON dv.id = d.design_version_id
     WHERE j.suspended_at IS NULL AND ${where}
     ORDER BY COALESCE((SELECT max(a.updated) FROM annotation_values a WHERE a.coder_id = c.id), c.created) DESC`,
    params,
  );
  return rows.map((r) => ({
    deployment: String(r.job_id),
    title: r.title,
    started: r.created,
    lastActive: r.last_active && r.last_active > r.created ? r.last_active : r.created,
    ended: r.ended?.outcome ?? null,
    units: r.units,
  }));
}
