import type { JobResponse } from "@annotinder/contracts";

export interface JobRow {
  id: number;
  name: string;
  archived: boolean;
  created: Date;
  owner_id: number | null;
  suspended_at: Date | null;
}

export function toJobResponse(row: JobRow): JobResponse {
  return { id: row.id, name: row.name, archived: row.archived, created: row.created, suspendedAt: row.suspended_at };
}
