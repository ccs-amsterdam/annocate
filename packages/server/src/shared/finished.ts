import type { VariableValue } from "@annotinder/contracts";
import { and, asc, eq, inArray, isNotNull, isNull, min, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { annotationValues as a, coders } from "../db/schema/index.js";
import type { Finished, FinishedRequest } from "../runtime/types.js";
import { coderValues } from "./coders.js";

/**
 * What coders finished, per group of variables (usually a unit loop's
 * questions): the (unit, coder) pairs where *every* variable has a live
 * value, oldest first. Coder-level groups: the coders that have all of them.
 * Only filters; which variables make up a loop is the runtime's business
 * (it reads the design).
 *
 * Used by the runtime (runtime/store.ts) and when deploying (to warn about
 * loops that gained questions).
 */
export async function listFinished(db: Db, studyId: number, request: FinishedRequest): Promise<Finished[]> {
  const result: Finished[] = [];
  /** Live unit answers to these variables, of the coder (or all coders). */
  const liveAnswers = (variables: string[]) =>
    and(
      eq(a.studyId, studyId),
      isNotNull(a.unitId),
      isNull(a.retiredAt),
      inArray(a.variable, variables),
      request.coderId === undefined ? undefined : eq(a.coderId, request.coderId),
    );

  for (const group of request.loops) {
    if (group.level === "coder") {
      result.push(...(await listFinishedCoders(db, studyId, group, request.coderId)));
      continue;
    }
    const variables = [...new Set(group.variables)];
    const created = min(a.created);
    const finished = await db
      .select({ unitId: sql<number>`${a.unitId}`, coderId: a.coderId, created: created.mapWith(a.created) })
      .from(a)
      .where(liveAnswers(variables))
      .groupBy(a.unitId, a.coderId)
      .having(sql`count(*) = ${variables.length}`)
      .orderBy(asc(created), asc(a.unitId));

    // The values of e.g. agreement variables come along, for the finished units only.
    const wanted = [...new Set(group.values ?? [])];
    const values = new Map<string, Record<string, VariableValue>>();
    if (wanted.length > 0) {
      const rows = await db
        .select({ unitId: a.unitId, coderId: a.coderId, variable: a.variable, value: a.value })
        .from(a)
        .where(liveAnswers(wanted));
      for (const row of rows) {
        const key = `${row.unitId}/${row.coderId}`;
        values.set(key, { ...values.get(key), [row.variable]: row.value });
      }
    }

    for (const row of finished) {
      result.push({
        loop: group.loop,
        unitId: row.unitId,
        coderId: row.coderId,
        created: row.created!,
        ...(wanted.length > 0 ? { values: values.get(`${row.unitId}/${row.coderId}`) ?? {} } : {}),
      });
    }
  }
  return result;
}

/** Coder-level groups: the coders whose answer rows without a unit include all of the group's variables. */
async function listFinishedCoders(
  db: Db,
  studyId: number,
  group: FinishedRequest["loops"][number],
  coderId: number | undefined,
): Promise<Finished[]> {
  const rows = await db
    .select({ id: coders.id, created: coders.created })
    .from(coders)
    .where(and(eq(coders.studyId, studyId), coderId === undefined ? undefined : eq(coders.id, coderId)))
    .orderBy(asc(coders.id));
  const values = await coderValues(db, studyId, coderId);
  const result: Finished[] = [];
  for (const coder of rows) {
    const own = values.get(coder.id) ?? {};
    if (!group.variables.every((v) => v in own)) continue;
    result.push({
      loop: group.loop,
      unitId: null,
      coderId: coder.id,
      created: coder.created,
      ...(group.values?.length ? { values: Object.fromEntries(group.values.filter((v) => v in own).map((v) => [v, own[v]])) } : {}),
    });
  }
  return result;
}
