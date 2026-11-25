import type { StudyResponse } from "@annotinder/contracts";
import type { Server } from "../context.js";
import type { studies } from "../db/schema/index.js";
import { removeResultsExports } from "./resultsExport.js";

export type StudyRow = typeof studies.$inferSelect;

export function toStudyResponse(row: StudyRow): StudyResponse {
  return {
    id: row.id,
    publicId: row.publicId,
    name: row.name,
    archived: row.archived,
    created: row.created,
    reopenMinutes: row.reopenMinutes,
    redirectUrls: row.redirectUrls ?? {},
    suspendedAt: row.suspendedAt,
    origin: row.origin,
  };
}

/**
 * After a study's rows are deleted: what the server still holds of it
 * outside the database goes too. Its runtime stops serving coders, and its
 * stored results exports are removed, so a download link handed out before
 * stops working.
 */
export async function forgetDeletedStudy(server: Server, studyId: number): Promise<void> {
  server.deployments.drop(studyId);
  await removeResultsExports(server.files, studyId);
}
