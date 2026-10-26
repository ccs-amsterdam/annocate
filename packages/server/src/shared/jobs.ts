import type { JobResponse } from "@annotinder/contracts";

export interface JobRow {
  id: number;
  name: string;
  archived: number;
  created: string;
}

export function toJobResponse(row: JobRow): JobResponse {
  return { id: row.id, name: row.name, archived: !!row.archived, created: new Date(row.created) };
}
