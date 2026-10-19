import type { CoderInviteResponse } from "@annotinder/contracts";

export interface InviteRow {
  id: number;
  jobId: number;
  label: string;
  auth: string;
  secret: string;
  emails: string | null;
  maxUses: number | null;
  uses: number;
  variables: string;
  participantId: string | null;
  participantFromUrl: number;
  created: string | null;
  revokedAt: string | null;
}

export function toInviteResponse(row: InviteRow): CoderInviteResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    label: row.label,
    auth: row.auth as CoderInviteResponse["auth"],
    secret: row.secret,
    uses: row.uses,
    ...(row.emails ? { emails: JSON.parse(row.emails) } : {}),
    ...(row.maxUses !== null ? { maxUses: row.maxUses } : {}),
    variables: JSON.parse(row.variables),
    ...(row.participantId !== null ? { participantId: row.participantId } : {}),
    ...(row.participantFromUrl ? { participantFromUrl: true } : {}),
    created: row.created ? new Date(row.created) : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
  };
}
