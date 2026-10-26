import type { Coder } from "../runtime/types.js";

/** A row of `coders` (schema.sql). */
export interface CoderRow {
  id: number;
  jobId: number;
  coderKey: string;
  email: string | null;
  participantId: string | null;
  inviteId: number | null;
  variables: string;
  assignments: string;
  created: string;
}

/** A coder as the runtime sees it: no email or other identifying data. */
export function toCoder(row: CoderRow): Coder {
  return { coderId: row.id, variables: JSON.parse(row.variables), assignments: JSON.parse(row.assignments) };
}
