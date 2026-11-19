import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { VariableValue } from "@annotinder/contracts";
import type { Coder, CoderValue, CoderValuesWrite } from "../runtime/types.js";
import type { Db } from "../db/index.js";
import { annotationValues as a, coders } from "../db/schema/index.js";

/** A row of `coders`. */
export type CoderRow = typeof coders.$inferSelect;

/** A coder as the runtime sees it: no identifying data, except the email the coder linked themselves. */
export function toCoder(row: CoderRow): Coder {
  return {
    coderId: row.id,
    assignments: row.assignments ?? {},
    ended: row.ended,
    deletionRequest: row.deletionRequest,
    session: { ...row.session, ...(row.participantId ? { participant: row.participantId } : {}) },
    linkId: row.linkId,
    email: row.email,
  };
}

/** A coder's live coder-level answers: without a unit, not retired. */
const liveCoderLevel = (studyId: number) => and(eq(a.studyId, studyId), isNull(a.unitId), isNull(a.retiredAt));

/** Coder-level values (answers outside unit loops, and assigned values): the live answer rows without a unit, per coder. */
export async function coderValues(
  db: Db,
  studyId: number,
  coderId?: number,
): Promise<Map<number, Record<string, VariableValue>>> {
  const rows = await db
    .select({ coderId: a.coderId, variable: a.variable, value: a.value })
    .from(a)
    .where(and(liveCoderLevel(studyId), coderId === undefined ? undefined : eq(a.coderId, coderId)))
    .orderBy(asc(a.id));
  const byCoder = new Map<number, Record<string, VariableValue>>();
  for (const row of rows) {
    let values = byCoder.get(row.coderId);
    if (!values) byCoder.set(row.coderId, (values = {}));
    values[row.variable] = row.value;
  }
  return byCoder;
}

/** One coder's live coder-level answers, with whether they can still change. */
export async function coderAnswers(db: Db, studyId: number, coderId: number): Promise<Record<string, CoderValue>> {
  const rows = await db
    .select({ variable: a.variable, value: a.value, assigned: a.assigned, frozen: a.frozen })
    .from(a)
    .where(and(liveCoderLevel(studyId), eq(a.coderId, coderId)));
  return Object.fromEntries(rows.map(({ variable, ...rest }) => [variable, rest]));
}

/**
 * Writes coder-level values: a row each, without a unit (`assigned`: by the
 * server, not answered), with their timings (`CoderValuesWrite.timings`).
 * Assigned and frozen answers are left as they are.
 */
export async function putCoderValues(db: Db, studyId: number, write: CoderValuesWrite): Promise<void> {
  const timing = (variable: string) => write.timings?.[variable] ?? null;
  for (const [variable, value] of Object.entries(write.values)) {
    await db
      .insert(a)
      .values({
        studyId,
        coderId: write.coderId,
        variable,
        value,
        designVersionId: write.designVersionId ?? null,
        deviceId: write.deviceId ?? null,
        assigned: write.assigned ?? false,
        timing: timing(variable),
        created: sql`now()`,
        updated: sql`now()`,
      })
      .onConflictDoUpdate({
        // The live coder-level answer (the partial unique index annotation_values_coder_live)
        target: [a.coderId, a.variable],
        targetWhere: and(isNull(a.retiredAt), isNull(a.unitId)),
        set: {
          value: sql`excluded.value`,
          designVersionId: sql`excluded.design_version_id`,
          deviceId: sql`excluded.device_id`,
          timing: sql`excluded.timing`,
          updated: sql`excluded.updated`,
        },
        setWhere: sql`NOT ${a.assigned} AND NOT ${a.frozen}`,
      });
  }
  for (const variable of Object.keys(write.timings ?? {})) {
    if (variable in write.values) continue;
    await db
      .update(a)
      .set({ timing: timing(variable) })
      .where(
        and(liveCoderLevel(studyId), eq(a.coderId, write.coderId), eq(a.variable, variable), eq(a.assigned, false)),
      );
  }
}
