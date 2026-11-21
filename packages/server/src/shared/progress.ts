import { listSetGroups } from "./sets.js";
import {
  loopShareColumns,
  type CoderProgress,
  type StudyOverview,
  loginRequired,
  sessionItem,
} from "@annotinder/contracts";
import { designVersionItems } from "./designVersions.js";
import { and, asc, count, countDistinct, eq, gte, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { anyOf } from "../db/sql.js";
import {
  annotationValues as a,
  coders as codersTable,
  designVersions,
  links,
  unitCodings,
  unitSetMembers,
  unitSets,
  units,
} from "../db/schema/index.js";
import { getDeployment, loopVariables } from "./deployments.js";
import { coderValues } from "./coders.js";

const DAY_MS = 24 * 60 * 60_000;

/** Live answers given by coders (not assigned by the server). */
const given = (studyId: number) => and(eq(a.studyId, studyId), isNull(a.retiredAt), eq(a.assigned, false));
const ACTIVITY_DAYS = 30;

/**
 * Coder id -> units finished, per loop of the live design version: every question
 * of the loop has a live answer (the rule of `listFinished`).
 */
async function finishedPerLoop(db: Db, studyId: number): Promise<Map<string, Map<number, number>>> {
  const result = new Map<string, Map<number, number>>();
  const deployment = await getDeployment(db, studyId);
  if (!deployment) return result;
  for (const [loop, questions] of await loopVariables(db, studyId, deployment.designVersionId)) {
    const variables = [...new Set(questions)];
    if (variables.length === 0) continue;
    // (unit, coder) pairs with a live answer to every question of the loop
    const finished = db
      .select({ coderId: a.coderId })
      .from(a)
      .where(and(eq(a.studyId, studyId), isNotNull(a.unitId), isNull(a.retiredAt), inArray(a.variable, variables)))
      .groupBy(a.unitId, a.coderId)
      .having(sql`count(DISTINCT ${a.variable}) = ${variables.length}`)
      .as("finished");
    const rows = await db.select({ coderId: finished.coderId, n: count() }).from(finished).groupBy(finished.coderId);
    result.set(loop, new Map(rows.map((r) => [r.coderId, r.n])));
  }
  return result;
}

/** `GET /coders`: every coder of the study with their link, activity and finished units. */
export async function listCoderProgress(db: Db, studyId: number): Promise<CoderProgress[]> {
  const coders = await db
    .select({ coder: codersTable, linkLabel: links.label })
    .from(codersTable)
    .leftJoin(links, eq(links.id, codersTable.linkId))
    .where(eq(codersTable.studyId, studyId))
    .orderBy(asc(codersTable.id));
  const activity = new Map(
    (
      await db
        .select({ coderId: a.coderId, answers: count(), lastActive: max(a.updated) })
        .from(a)
        .where(given(studyId))
        .groupBy(a.coderId)
    ).map((r) => [r.coderId, r]),
  );
  const finished = await finishedPerLoop(db, studyId);
  const values = await coderValues(db, studyId);
  // Special units as deployed (docs/architecture.md §6): practice and gold units of any set
  // column are everyone's; the overlap is that of the coder column, or (no coders) of the columns
  // the coder's session values select units by. Counted for coders who were routed in a loop.
  const kinds = { _overlap: "overlap", _gold: "gold", _practice: "practice" } as const;
  type Kind = keyof typeof kinds;
  const members = await db
    .select({ grp: unitSets.grp, name: sql<Kind>`${unitSets.name}`, unitId: unitSetMembers.unitId })
    .from(unitSets)
    .innerJoin(unitSetMembers, eq(unitSetMembers.setId, unitSets.id))
    .where(and(eq(unitSets.studyId, studyId), eq(unitSets.live, true), inArray(unitSets.name, Object.keys(kinds))));
  const doneRows = await db
    .selectDistinct({ coderId: unitCodings.coderId, unitId: unitCodings.unitId })
    .from(unitCodings)
    .where(
      and(eq(unitCodings.studyId, studyId), anyOf(unitCodings.unitId, [...new Set(members.map((m) => m.unitId))])),
    );
  const done = new Map<number, Set<number>>();
  for (const r of doneRows) done.set(r.coderId, (done.get(r.coderId) ?? new Set()).add(r.unitId));
  const deployment = await getDeployment(db, studyId);
  const [deployed] = deployment
    ? await db
        .select({ items: designVersions.items, session: designVersions.session })
        .from(designVersions)
        .where(eq(designVersions.id, deployment.designVersionId))
    : [];
  // Coders' emails only where the study requires sign-in: elsewhere coders sign in for themselves (other devices)
  const showEmails = deployed ? loginRequired(sessionItem(designVersionItems(deployed))) : false;
  const shareColumns = deployed
    ? [...new Map([...loopShareColumns(designVersionItems(deployed)).values()].flat().map((c) => [c.name, c.column]))]
    : [];
  const special = (coderId: number, session: Record<string, string>, assignments: Record<string, unknown>) => {
    const out: CoderProgress["special"] = {};
    if (Object.keys(assignments ?? {}).length === 0) return out;
    const selected = shareColumns.filter(([name]) => session?.[name] !== undefined);
    // As the runtime (`shareOf`): the coder column's, when coders divide the units (a condition column's
    // `_overlap` is in every condition: own units); else the session's columns, or (none) every column
    const coderColumn = selected.find(([name]) => name === "coder")?.[1];
    const overlapColumns = new Set(
      coderColumn
        ? [coderColumn]
        : selected.length > 0
          ? selected.map(([, column]) => column)
          : members.map((m) => m.grp),
    );
    for (const [name, kind] of Object.entries(kinds) as [Kind, (typeof kinds)[Kind]][]) {
      const units = new Set(
        members
          .filter((m) => m.name === name && (name !== "_overlap" || overlapColumns.has(m.grp)))
          .map((m) => m.unitId),
      );
      if (units.size === 0) continue;
      out[kind] = { done: [...units].filter((id) => done.get(coderId)?.has(id)).length, total: units.size };
    }
    return out;
  };

  return coders.map(({ coder: c, linkLabel }) => ({
    id: c.id,
    ...(c.email && showEmails ? { email: c.email } : {}),
    ...(c.participantId ? { participantId: c.participantId } : {}),
    linkId: c.linkId,
    linkLabel,
    started: c.created,
    lastActive: activity.get(c.id)?.lastActive ?? null,
    answers: activity.get(c.id)?.answers ?? 0,
    finished: Object.fromEntries([...finished].map(([loop, perCoder]) => [loop, perCoder.get(c.id) ?? 0])),
    special: special(c.id, c.session, c.assignments),
    variables: values.get(c.id) ?? {},
    ended: c.ended,
    deletionRequest: c.deletionRequest,
    session: c.session,
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
      coders: countDistinct(a.coderId),
      activeLastDay: sql<number>`count(DISTINCT ${a.coderId}) FILTER (WHERE ${a.updated} >= ${dayAgo})`.mapWith(Number),
      last: max(a.updated),
    })
    .from(a)
    .where(given(studyId));

  let codings = 0;
  for (const perCoder of (await finishedPerLoop(db, studyId)).values()) for (const n of perCoder.values()) codings += n;

  return {
    units: await db.$count(units, and(eq(units.studyId, studyId), eq(units.inDraft, true))),
    groups,
    coders: {
      total: await db.$count(codersTable, eq(codersTable.studyId, studyId)),
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
    .select({ day, answers: count(), coders: countDistinct(a.coderId) })
    .from(a)
    .where(and(eq(a.studyId, studyId), eq(a.assigned, false), gte(a.created, new Date(`${days[0]}T00:00:00Z`))))
    .groupBy(day);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((day) => ({ day, answers: byDay.get(day)?.answers ?? 0, coders: byDay.get(day)?.coders ?? 0 }));
}
