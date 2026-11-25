import { own } from "@annotinder/contracts";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { type Db } from "../db/index.js";
import { annotationValues, unitCodings, unitLeases, units, unitVersions } from "../db/schema/index.js";
import { HttpError } from "./http.js";
import { lockUnits } from "./units.js";
import type { AnnotationWrite, Coding } from "../runtime/types.js";

// Writing a coder's answers to a unit (`Store.putAnnotation`), and the codings they finish.

/**
 * Upserts a live value per given variable; variables not given are left
 * alone (so values from older design versions stay). `created` is kept
 * on update. Also stores the codings the answers finish, and marks the unit coded.
 */
export async function putAnnotation(db: Db, studyId: number, write: AnnotationWrite): Promise<void> {
  await db.transaction(async (tx) => {
    const [unit] = await tx
      .select({ coded: units.coded })
      .from(units)
      .where(and(eq(units.studyId, studyId), eq(units.id, write.unitId)));
    if (!unit) throw new HttpError(404, "Unit not found");
    // No deploy deletes versions meanwhile
    await lockUnits(tx, studyId, "read");
    await writeUnitAnswers(tx, studyId, write, await answeredVersion(tx, write));
    await recordCodings(tx, studyId, write);
    if (!unit.coded) await tx.update(units).set({ coded: true }).where(eq(units.id, write.unitId));
  });
}

/**
 * The unit version the answers are about: the one the coder saw; one a
 * deploy just deleted (nobody had answered on it) gives way to the current
 * one. Neither: a deploy took the unit out meanwhile (409 `unit_removed`).
 */
async function answeredVersion(tx: Db, write: AnnotationWrite): Promise<number> {
  const [version] = await tx
    .select({ id: unitVersions.id })
    .from(unitVersions)
    .where(
      or(
        write.unitVersionId == null ? undefined : eq(unitVersions.id, write.unitVersionId),
        and(eq(unitVersions.unitId, write.unitId), isNull(unitVersions.toDeploy)),
      ),
    )
    .orderBy(sql`${unitVersions.id} = ${write.unitVersionId ?? null}::bigint DESC NULLS LAST`)
    .limit(1);
  if (!version) throw new HttpError(409, "This unit is no longer part of the study", "unit_removed");
  return version.id;
}

/** A live answer row per variable, about this unit version. */
async function writeUnitAnswers(tx: Db, studyId: number, write: AnnotationWrite, unitVersionId: number): Promise<void> {
  const a = annotationValues;
  for (const [variable, value] of Object.entries(write.variables)) {
    await tx
      .insert(a)
      .values({
        studyId,
        unitId: write.unitId,
        sessionId: write.sessionId,
        variable,
        value,
        designVersionId: write.designVersionId,
        unitVersionId,
        deviceId: write.deviceId ?? null,
        timing: own(write.timings, variable) ?? null,
        created: sql`now()`,
        updated: sql`now()`,
      })
      .onConflictDoUpdate({
        // The live answer (the partial unique index annotation_values_live)
        target: [a.unitId, a.sessionId, a.variable],
        targetWhere: isNull(a.retiredAt),
        set: {
          value: sql`excluded.value`,
          designVersionId: sql`excluded.design_version_id`,
          unitVersionId: sql`excluded.unit_version_id`,
          deviceId: sql`excluded.device_id`,
          timing: sql`excluded.timing`,
          updated: sql`excluded.updated`,
        },
      });
  }
}

/** The codings the answers finish, each ending the coder's lease on the unit. */
async function recordCodings(tx: Db, studyId: number, write: AnnotationWrite): Promise<void> {
  for (const coding of write.codings ?? []) {
    const now = new Date();
    await insertCoding(tx, studyId, {
      loop: coding.loop,
      unitId: write.unitId,
      sessionId: write.sessionId,
      agreement: coding.agreement,
      created: now,
      updated: now,
    });
    // Finished: the coder's lease on it has done its study (distribution ignores it from now on anyway).
    await tx
      .delete(unitLeases)
      .where(
        and(
          eq(unitLeases.studyId, studyId),
          eq(unitLeases.loopKey, coding.loop),
          eq(unitLeases.sessionId, write.sessionId),
          eq(unitLeases.unitId, write.unitId),
        ),
      );
  }
}

/** Stores a finished coding; one finished again keeps its first time and gets the new agreement answers. */
async function insertCoding(db: Db, studyId: number, c: Coding): Promise<void> {
  await db
    .insert(unitCodings)
    .values({
      studyId,
      loopKey: c.loop,
      unitId: c.unitId,
      sessionId: c.sessionId,
      agreement: c.agreement,
      created: c.created,
      updated: c.updated,
    })
    .onConflictDoUpdate({
      target: [unitCodings.studyId, unitCodings.loopKey, unitCodings.unitId, unitCodings.sessionId],
      set: { agreement: sql`excluded.agreement`, updated: sql`excluded.updated` },
    });
}

/** Codings stored per statement (`insertCodings`). */
const CODINGS_PER_INSERT = 5000;

/** Stores many codings, a few statements for all of them: rederiving a study's codings holds up its coders meanwhile. */
export async function insertCodings(db: Db, studyId: number, codings: Coding[]): Promise<void> {
  for (let from = 0; from < codings.length; from += CODINGS_PER_INSERT) {
    const chunk = codings.slice(from, from + CODINGS_PER_INSERT);
    const column = <T>(value: (coding: Coding) => T) => sql.param(chunk.map(value));
    await db.execute(sql`
      INSERT INTO ${unitCodings} (study_id, loop_key, unit_id, session_id, agreement, created, updated)
      SELECT ${studyId}, c.loop_key, c.unit_id, c.session_id, c.agreement::jsonb, c.created, c.updated
      FROM unnest(
        ${column((c) => c.loop)}::text[],
        ${column((c) => c.unitId)}::bigint[],
        ${column((c) => c.sessionId)}::bigint[],
        ${column((c) => JSON.stringify(c.agreement))}::text[],
        ${column((c) => c.created.toISOString())}::timestamptz[],
        ${column((c) => c.updated.toISOString())}::timestamptz[]
      ) AS c(loop_key, unit_id, session_id, agreement, created, updated)
      ON CONFLICT DO NOTHING`);
  }
}
