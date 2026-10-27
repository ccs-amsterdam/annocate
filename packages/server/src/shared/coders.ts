import type { SessionEnd, VariableValue } from "@annotinder/contracts";
import type { Coder, CoderAssignments, LoopAssignment } from "../runtime/types.js";

/** A row of `coders`. */
export interface CoderRow {
  id: number;
  job_id: number;
  coder_key: string;
  email: string | null;
  participant_id: string | null;
  invite_id: number | null;
  variables: Record<string, VariableValue>;
  /** Stored as `CoderAssignments`; before 2026-10-27 as loop -> unitset names. */
  assignments: Record<string, LoopAssignment | string[]>;
  ended: SessionEnd | null;
  created: Date;
}

/** A coder as the runtime sees it: no email or other identifying data. */
export function toCoder(row: CoderRow): Coder {
  const assignments: CoderAssignments = {};
  for (const [loop, a] of Object.entries(row.assignments ?? {})) {
    assignments[loop] = Array.isArray(a) ? { unitsets: a, at: row.created.getTime() } : a;
  }
  return { coderId: row.id, variables: row.variables, assignments, ended: row.ended, inviteId: row.invite_id };
}
