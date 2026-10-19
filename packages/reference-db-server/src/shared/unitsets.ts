import type { UnitsetResponse } from "@annotinder/contracts";

export interface UnitsetRow {
  id: number;
  jobId: number;
  name: string;
  unitIds: string;
}

export function toUnitsetResponse(row: UnitsetRow): UnitsetResponse {
  return { id: row.id, jobId: row.jobId, name: row.name, unitIds: JSON.parse(row.unitIds) };
}
