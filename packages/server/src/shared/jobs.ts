import type { JobResponse } from "@annotinder/contracts";

export interface JobRow {
  id: number;
  name: string;
  archived: boolean;
  created: Date;
}

export function toJobResponse(row: JobRow): JobResponse {
  return { id: row.id, name: row.name, archived: row.archived, created: row.created };
}
