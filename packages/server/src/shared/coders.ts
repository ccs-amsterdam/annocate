import type { DeletionRequest, SessionEnd, VariableValue } from "@annotinder/contracts";
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
  ended: SessionEnd | null;
  deletion_request: DeletionRequest | null;
  session: Record<string, string>;
  created: Date;
}

/** A coder as the runtime sees it: no email or other identifying data, except the coder's own login. */
export function toCoder(row: CoderRow): Coder {
  return {
    coderId: row.id,
    variables: row.variables,
    assignments: row.assignments ?? {},
    ended: row.ended,
    deletionRequest: row.deletion_request,
    session: { ...row.session, ...(row.participant_id ? { participant: row.participant_id } : {}) },
    inviteId: row.invite_id,
    login: row.coder_key.startsWith("login:") ? row.email : null,
  };
}
