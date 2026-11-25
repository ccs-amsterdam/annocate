import { firstInvite, type CoderKind, type StudyResponse } from "@annotinder/contracts";
import { eq, sql } from "drizzle-orm";
import type { Server } from "../context.js";
import type { Db } from "../db/index.js";
import { deployments, designVersions, studies } from "../db/schema/index.js";
import { HttpError } from "./http.js";
import { removeResultsExports } from "./resultsExport.js";

export type StudyRow = typeof studies.$inferSelect;

export function toStudyResponse(row: StudyRow): StudyResponse {
  return {
    id: row.id,
    publicId: row.publicId,
    name: row.name,
    archived: row.archived,
    coderKind: row.coderKind,
    created: row.created,
    reopenMinutes: row.reopenMinutes,
    redirectUrls: row.redirectUrls ?? {},
    suspendedAt: row.suspendedAt,
    origin: row.origin,
  };
}

/** Who codes in a study: expert coders or a crowd (`studies.coder_kind`). 404 for a study that doesn't exist. */
export async function studyCoderKind(db: Db, studyId: number): Promise<CoderKind> {
  const [study] = await db.select({ coderKind: studies.coderKind }).from(studies).where(eq(studies.id, studyId));
  if (!study) throw new HttpError(404, "Study not found");
  return study.coderKind;
}

/**
 * Changes who codes in a study, which its first deploy fixes: afterwards
 * 409 `coder_kind_locked`. The study's designs (all drafts still) get the
 * new kind's first invitation, so they stay designs of the study's kind.
 */
export async function changeCoderKind(db: Db, studyId: number, coderKind: CoderKind): Promise<void> {
  if ((await db.$count(deployments, eq(deployments.studyId, studyId))) > 0)
    throw new HttpError(
      409,
      "Who codes (expert coders or a crowd) can't be changed after the study's first deploy",
      "coder_kind_locked",
    );
  await db.update(studies).set({ coderKind }).where(eq(studies.id, studyId));
  const invite = JSON.stringify(firstInvite(coderKind));
  await db
    .update(designVersions)
    .set({
      session: sql`jsonb_set(${designVersions.session}, '{invite}', ${invite}::jsonb)`,
      revision: sql`${designVersions.revision} + 1`,
      updated: sql`now()`,
    })
    .where(eq(designVersions.studyId, studyId));
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
