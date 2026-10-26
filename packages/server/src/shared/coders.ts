import type { VariableValue } from "@annotinder/contracts";
import type { Coder, CoderAssignments } from "../runtime/types.js";

/** A row of `coders`. */
export interface CoderRow {
  id: number;
  job_id: number;
  coder_key: string;
  email: string | null;
  participant_id: string | null;
  invite_id: number | null;
  variables: Record<string, VariableValue>;
  assignments: CoderAssignments;
  created: Date;
}

/** A coder as the runtime sees it: no email or other identifying data. */
export function toCoder(row: CoderRow): Coder {
  return { coderId: row.id, variables: row.variables, assignments: row.assignments };
}
