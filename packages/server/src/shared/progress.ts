import { listSetGroups } from "./sets.js";
import {
  TEST_SET,
  TEST_SET_TYPES,
  type CoderProgress,
  type TestSetType,
  type StudyOverview,
  loginRequired,
  sessionItem,
} from "@annotinder/contracts";
import { designVersionItems } from "./designVersions.js";
import { and, asc, count, countDistinct, eq, gte, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { rows, type Db } from "../db/index.js";
import { anyOf } from "../db/sql.js";
import {
  annotationValues as a,
  coderSessions,
  designVersions,
  links,
  unitCodings,
  unitSetMembers,
  unitSets,
  units,
} from "../db/schema/index.js";
import { getDeployment, loopQuestions } from "./deployments.js";
import { coderValues } from "./coders.js";

const DAY_MS = 24 * 60 * 60_000;

/** Live answers given by coders (not assigned by the server). */
const given = (studyId: number) => and(eq(a.studyId, studyId), isNull(a.retiredAt), eq(a.assigned, false));
const ACTIVITY_DAYS = 30;

/** A loop of the live design version, with per session id the units finished in it. */
interface LoopFinished {
  loop: string;
  title: string;
  perCoder: Map<number, number>;
}

/**
 * Units finished per coder, for each loop of the live design version: every question
 * of the loop has a live answer (the rule of `listFinished`).
 */
async function finishedPerLoop(db: Db, studyId: number): Promise<LoopFinished[]> {
  const result: LoopFinished[] = [];
  const deployment = await getDeployment(db, studyId);
  if (!deployment) return result;
  for (const { loop, title, variables: questions } of await loopQuestions(db, studyId, deployment.designVersionId)) {
    const variables = [...new Set(questions)];
    if (variables.length === 0) continue;
    // (unit, coder) pairs with a live answer to every question of the loop
    const finished = db
      .select({ sessionId: a.sessionId })
      .from(a)
      .where(and(eq(a.studyId, studyId), isNotNull(a.unitId), isNull(a.retiredAt), inArray(a.variable, variables)))
      .groupBy(a.unitId, a.sessionId)
      .having(sql`count(DISTINCT ${a.variable}) = ${variables.length}`)
      .as("finished");
    const rows = await db
      .select({ sessionId: finished.sessionId, n: count() })
      .from(finished)
      .groupBy(finished.sessionId);
    result.push({ loop, title, perCoder: new Map(rows.map((r) => [r.sessionId, r.n])) });
  }
  return result;
}

/**
 * Per session, the deployed test units it finished, of how many (contracts
 * `CoderProgress.testUnits`; docs/architecture.md §6): those of `test_set`.
 * Counted for sessions that were routed in a loop.
 */
async function testUnitProgress(db: Db, studyId: number, deployed: boolean) {
  const members = deployed
    ? await db
        .select({ name: sql<TestSetType>`${unitSets.name}`, unitId: unitSetMembers.unitId })
        .from(unitSets)
        .innerJoin(unitSetMembers, eq(unitSetMembers.setId, unitSets.id))
        .where(
          and(
            eq(unitSets.studyId, studyId),
            eq(unitSets.live, true),
            eq(unitSets.grp, TEST_SET),
            inArray(unitSets.name, [...TEST_SET_TYPES]),
          ),
        )
    : [];
  const doneRows = members.length
    ? await db
        .selectDistinct({ sessionId: unitCodings.sessionId, unitId: unitCodings.unitId })
        .from(unitCodings)
        .where(
          and(eq(unitCodings.studyId, studyId), anyOf(unitCodings.unitId, [...new Set(members.map((m) => m.unitId))])),
        )
    : [];
  const done = new Map<number, Set<number>>();
  for (const r of doneRows) done.set(r.sessionId, (done.get(r.sessionId) ?? new Set()).add(r.unitId));
  return (sessionId: number, assignments: Record<string, unknown>) => {
    const out: CoderProgress["testUnits"] = {};
    if (Object.keys(assignments ?? {}).length === 0) return out;
    for (const kind of TEST_SET_TYPES) {
      const unitIds = new Set(members.filter((m) => m.name === kind).map((m) => m.unitId));
      if (unitIds.size === 0) continue;
      out[kind] = { done: [...unitIds].filter((id) => done.get(sessionId)?.has(id)).length, total: unitIds.size };
    }
    return out;
  };
}

/** `GET /coders`: every coder of the study with their link, activity and finished units. */
export async function listCoderProgress(db: Db, studyId: number): Promise<CoderProgress[]> {
  const coders = await db
    .select({ coder: coderSessions, linkLabel: links.label })
    .from(coderSessions)
    .innerJoin(links, eq(links.id, coderSessions.linkId))
    .where(eq(coderSessions.studyId, studyId))
    .orderBy(asc(coderSessions.id));
  const activity = new Map(
    (
      await db
        .select({ sessionId: a.sessionId, answers: count(), lastActive: max(a.updated) })
        .from(a)
        .where(given(studyId))
        .groupBy(a.sessionId)
    ).map((r) => [r.sessionId, r]),
  );
  const finished = await finishedPerLoop(db, studyId);
  const values = await coderValues(db, studyId);
  const deployment = await getDeployment(db, studyId);
  const [deployed] = deployment
    ? await db
        .select({ items: designVersions.items, session: designVersions.session })
        .from(designVersions)
        .where(eq(designVersions.id, deployment.designVersionId))
    : [];
  const deployedItems = deployed ? designVersionItems(deployed) : null;
  // Coders' emails only where the study requires sign-in: elsewhere coders sign in for themselves (other devices)
  const showEmails = deployedItems ? loginRequired(sessionItem(deployedItems)) : false;
  const testUnits = await testUnitProgress(db, studyId, deployedItems !== null);

  return coders.map(({ coder: c, linkLabel }) => ({
    id: c.id,
    ...(c.email && showEmails ? { email: c.email } : {}),
    ...(c.coder ? { coder: c.coder } : {}),
    linkId: c.linkId,
    linkLabel,
    started: c.created,
    lastActive: activity.get(c.id)?.lastActive ?? null,
    answers: activity.get(c.id)?.answers ?? 0,
    finished: finished.map(({ loop, title, perCoder }) => ({ loop, title, units: perCoder.get(c.id) ?? 0 })),
    testUnits: testUnits(c.id, c.assignments),
    variables: values.get(c.id) ?? {},
    ended: c.ended,
    deletionRequest: c.deletionRequest,
    session: c.session,
    display: c.display,
  }));
}

/** `GET /overview`: counts and the last 30 days of activity. */
export async function studyOverview(db: Db, studyId: number, now = new Date()): Promise<StudyOverview> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const groups = (await listSetGroups(db, studyId)).map((g) => ({
    name: g.name,
    sets: g.sets.map((s) => ({ name: s.name, units: s.unitIds.length })),
  }));
  const [answers] = await db
    .select({
      total: count(),
      coders: countDistinct(a.sessionId),
      activeLastDay: sql<number>`count(DISTINCT ${a.sessionId}) FILTER (WHERE ${a.updated} >= ${dayAgo})`.mapWith(
        Number,
      ),
      last: max(a.updated),
    })
    .from(a)
    .where(given(studyId));

  let codings = 0;
  for (const { perCoder } of await finishedPerLoop(db, studyId)) for (const n of perCoder.values()) codings += n;

  return {
    units: await db.$count(units, and(eq(units.studyId, studyId), eq(units.inDraft, true))),
    groups,
    coders: {
      total: await db.$count(coderSessions, eq(coderSessions.studyId, studyId)),
      started: answers!.coders,
      activeLastDay: answers!.activeLastDay,
    },
    answers: answers!.total,
    codings,
    lastActivity: answers!.last,
    activity: await activityPerDay(db, studyId, now),
  };
}

/** Answers given per day (UTC; by creation, including ones retired later), with empty days filled in. */
async function activityPerDay(db: Db, studyId: number, now: Date): Promise<StudyOverview["activity"]> {
  const days: string[] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--)
    days.push(new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  const day = sql<string>`to_char(${a.created} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, answers: count(), coders: countDistinct(a.sessionId) })
    .from(a)
    .where(and(eq(a.studyId, studyId), eq(a.assigned, false), gte(a.created, new Date(`${days[0]}T00:00:00Z`))))
    .groupBy(day);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((day) => ({ day, answers: byDay.get(day)?.answers ?? 0, coders: byDay.get(day)?.coders ?? 0 }));
}

/**
 * Per coder id, the units their sessions answered (`coded`: they stay with
 * the coder when units are redistributed or moved), and the ones they were
 * sent but didn't answer (`served`).
 */
export function coderUnits(db: Db, studyId: number): Promise<{ coder: string; coded: number[]; served: number[] }[]> {
  return rows<{ coder: string; coded: number[]; served: number[] }>(
    db,
    sql`SELECT coder,
          coalesce(array_agg(unit_id ORDER BY unit_id) FILTER (WHERE coded), '{}') AS "coded",
          coalesce(array_agg(unit_id ORDER BY unit_id) FILTER (WHERE NOT coded), '{}') AS "served"
        FROM (
          SELECT s.coder, seen.unit_id, bool_or(seen.coded) AS coded
          FROM (
            SELECT session_id, unit_id, false AS coded FROM unit_serves WHERE study_id = ${studyId}
            UNION ALL
            SELECT session_id, unit_id, true AS coded FROM annotation_values
              WHERE study_id = ${studyId} AND unit_id IS NOT NULL AND retired_at IS NULL
          ) seen
          JOIN coder_sessions s ON s.id = seen.session_id
          WHERE s.coder IS NOT NULL
          GROUP BY s.coder, seen.unit_id
        ) per_unit
        GROUP BY coder
        ORDER BY coder`,
  );
}
