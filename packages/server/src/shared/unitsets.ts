import type { Sql } from "../db.js";
import type { UnitsetResponse } from "@annotinder/contracts";

/** A row of `unitsets`. */
export interface UnitsetRow {
  id: number;
  job_id: number;
  name: string;
  unit_ids: number[];
}

export function toUnitsetResponse(row: UnitsetRow): UnitsetResponse {
  return { id: row.id, jobId: row.job_id, name: row.name, unitIds: row.unit_ids };
}

/** Unit ids that aren't units of the job (a unitset only holds the job's own units). */
export async function foreignUnitIds(sql: Sql, jobId: number, unitIds: number[]): Promise<number[]> {
  if (unitIds.length === 0) return [];
  const rows = await sql.query<{ id: number }>("SELECT id FROM units WHERE job_id = $1 AND id = ANY($2)", [jobId, unitIds]);
  const own = new Set(rows.map((r) => r.id));
  return [...new Set(unitIds.filter((id) => !own.has(id)))];
}
