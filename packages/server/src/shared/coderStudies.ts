import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { CoderStudy } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { annotationValues as a, coders, deployments, designVersions, studies } from "../db/schema/index.js";

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
    .where(and(eq(a.coderId, coders.id), isNotNull(a.unitId), isNull(a.retiredAt)));
  const lastAnswer = sql<string | null>`(SELECT max(${a.updated}) FROM ${a} WHERE ${a.coderId} = ${coders.id})`;
  const rows = await db
    .select({
      studyId: coders.studyId,
      title: sql<string | null>`${designVersions.public}->>'title'`,
      created: coders.created,
      ended: coders.ended,
      units: sql<number>`(${unitsAnswered})`,
      lastActive: lastAnswer,
    })
    .from(coders)
    .innerJoin(studies, eq(studies.id, coders.studyId))
    .innerJoin(deployments, eq(deployments.studyId, coders.studyId))
    .innerJoin(designVersions, eq(designVersions.id, deployments.designVersionId))
    .where(and(isNull(studies.suspendedAt), where))
    .orderBy(desc(sql`COALESCE(${lastAnswer}, ${coders.created})`));
  return rows.map((r) => {
    const lastActive = r.lastActive ? new Date(r.lastActive) : null;
    return {
      deployment: String(r.studyId),
      title: r.title,
      started: r.created,
      lastActive: lastActive && lastActive > r.created ? lastActive : r.created,
      ended: r.ended?.outcome ?? null,
      units: r.units,
    };
  });
}
