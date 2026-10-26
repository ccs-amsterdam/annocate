import type { CoderInviteResponse } from "@annotinder/contracts";

/** A row of `invites`. */
export interface InviteRow {
  id: number;
  job_id: number;
  label: string;
  auth: string;
  secret: string;
  emails: string[] | null;
  max_uses: number | null;
  uses: number;
  variables: Record<string, string>;
  participant_id: string | null;
  participant_from_url: boolean;
  created: Date;
  revoked_at: Date | null;
}

export function toInviteResponse(row: InviteRow): CoderInviteResponse {
  return {
    id: row.id,
    jobId: row.job_id,
    label: row.label,
    auth: row.auth as CoderInviteResponse["auth"],
    secret: row.secret,
    uses: row.uses,
    ...(row.emails ? { emails: row.emails } : {}),
    ...(row.max_uses !== null ? { maxUses: row.max_uses } : {}),
    variables: row.variables,
    ...(row.participant_id !== null ? { participantId: row.participant_id } : {}),
    ...(row.participant_from_url ? { participantFromUrl: true } : {}),
    created: row.created,
    revokedAt: row.revoked_at,
  };
}
