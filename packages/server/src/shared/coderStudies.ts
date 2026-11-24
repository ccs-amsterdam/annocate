import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { CoderStudy } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { annotationValues as a, coderSessions, deployments, designVersions, studies } from "../db/schema/index.js";

/**
 * Coders' sessions as studies for the coder home (contracts
 * `CoderStudySchema`): the deployed design's public title (never the
 * study's name: that is private), when the session started and was
 * last active, how it ended, and the units answered. Only studies that are
 * deployed and not suspended. `where`: which coders.
 */
export async function coderStudies(db: Db, where: SQL | undefined): Promise<CoderStudy[]> {
  const unitsAnswered = db
    .select({ n: sql<number>`count(DISTINCT ${a.unitId})::int` })
    .from(a)
    .where(and(eq(a.sessionId, coderSessions.id), isNotNull(a.unitId), isNull(a.retiredAt)));
  const lastAnswer = sql<
    string | null
  >`(SELECT max(${a.updated}) FROM ${a} WHERE ${a.sessionId} = ${coderSessions.id})`;
  const rows = await db
    .select({
      publicId: studies.publicId,
      title: sql<string | null>`${designVersions.public}->>'title'`,
      created: coderSessions.created,
      ended: coderSessions.ended,
      units: sql<number>`(${unitsAnswered})`,
      lastActive: lastAnswer,
    })
    .from(coderSessions)
    .innerJoin(studies, eq(studies.id, coderSessions.studyId))
    .innerJoin(deployments, eq(deployments.studyId, coderSessions.studyId))
    .innerJoin(designVersions, eq(designVersions.id, deployments.designVersionId))
    .where(and(isNull(studies.suspendedAt), where))
    .orderBy(desc(sql`COALESCE(${lastAnswer}, ${coderSessions.created})`));
  return rows.map((r) => {
    const lastActive = r.lastActive ? new Date(r.lastActive) : null;
    return {
      deployment: r.publicId,
      title: r.title,
      started: r.created,
      lastActive: lastActive && lastActive > r.created ? lastActive : r.created,
      ended: r.ended?.outcome ?? null,
      units: r.units,
    };
  });
}
