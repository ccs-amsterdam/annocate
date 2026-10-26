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
