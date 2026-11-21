import type { StudyResponse } from "@annotinder/contracts";
import type { studies } from "../db/schema/index.js";

export type StudyRow = typeof studies.$inferSelect;

export function toStudyResponse(row: StudyRow): StudyResponse {
  return {
    id: row.id,
    name: row.name,
    archived: row.archived,
    created: row.created,
    keepSessionsOpen: row.keepSessionsOpen,
    redirectUrls: row.redirectUrls ?? {},
    suspendedAt: row.suspendedAt,
    origin: row.origin,
  };
}
