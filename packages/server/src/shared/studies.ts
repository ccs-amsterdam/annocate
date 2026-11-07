import type { StudyResponse } from "@annotinder/contracts";

export interface StudyRow {
  id: number;
  name: string;
  archived: boolean;
  created: Date;
  owner_id: number | null;
  keep_sessions_open: boolean;
  suspended_at: Date | null;
  origin: string | null;
  redirect_urls: Record<string, string>;
}

export function toStudyResponse(row: StudyRow): StudyResponse {
  return {
    id: row.id,
    name: row.name,
    archived: row.archived,
    created: row.created,
    keepSessionsOpen: row.keep_sessions_open,
    redirectUrls: row.redirect_urls ?? {},
    suspendedAt: row.suspended_at,
    origin: row.origin,
  };
}
