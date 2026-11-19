import { and, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import type { CoderDeletion, DeleteCoders, DeleteCodersResponse } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { anyOf } from "../db/sql.js";
import { annotationValues as a, coderDeletions, coders, units } from "../db/schema/index.js";

/**
 * Deletes coders and everything they answered, for good (a participant
 * withdrew, docs/coder-identity.md): the coders (with their coder-level
 * answers, routing and deletion request) and all their answer rows, also
 * retired ones. Selected by id, participant id or email, within the study.
 * Units nobody has answers for any more can be deleted again. Unit
 * versions stay: they hold unit content, not the coder's. Each deleted coder
 * is logged (`coder_deletions`), with the ids downloaded results use.
 */
export async function deleteCoders(db: Db, studyId: number, select: DeleteCoders, deletedBy: string | null): Promise<DeleteCodersResponse> {
  return db.transaction(async (tx) => {
    const emails = (select.emails ?? []).map((e) => e.toLowerCase());
    const selected = await tx
      .select({ id: coders.id })
      .from(coders)
      .where(
        and(
          eq(coders.studyId, studyId),
          or(
            inArray(coders.id, select.coderIds ?? []),
            inArray(coders.participantId, select.participantIds ?? []),
            inArray(sql`lower(${coders.email})`, emails),
          ),
        ),
      );
    const ids = selected.map((c) => c.id);
    if (ids.length === 0) return { coderIds: [], answers: 0 };
    const theirs = and(eq(coders.studyId, studyId), inArray(coders.id, ids));
    const logged = await tx
      .select({
        studyId: coders.studyId,
        coderId: coders.id,
        participantId: coders.participantId,
        email: coders.email,
        requestedAt: coders.deletionRequest,
        answers: sql<number>`(${tx.select({ n: sql`count(*)::int` }).from(a).where(and(eq(a.studyId, coders.studyId), eq(a.coderId, coders.id)))})`,
      })
      .from(coders)
      .where(theirs);
    await tx.insert(coderDeletions).values(
      logged.map((c) => ({ ...c, requestedAt: c.requestedAt ? new Date(c.requestedAt.at) : null, deletedBy })),
    );
    const removed = await tx
      .delete(a)
      .where(and(eq(a.studyId, studyId), inArray(a.coderId, ids)))
      .returning({ unitId: a.unitId });
    await tx.delete(coders).where(theirs);
    const touched = [...new Set(removed.flatMap((r) => (r.unitId === null ? [] : [r.unitId])))];
    await tx
      .update(units)
      .set({ coded: exists(tx.select({ one: sql`1` }).from(a).where(eq(a.unitId, units.id))) })
      .where(and(eq(units.studyId, studyId), anyOf(units.id, touched)));
    return { coderIds: ids, answers: removed.length };
  });
}

/** Deletes later: the request stays, marked postponed, and is no longer brought up. Returns false if there is none. */
export async function postponeDeletion(db: Db, studyId: number, coderId: number): Promise<boolean> {
  const rows = await db
    .update(coders)
    .set({ deletionRequest: sql`${coders.deletionRequest} || jsonb_build_object('postponedAt', now())` })
    .where(and(eq(coders.studyId, studyId), eq(coders.id, coderId), sql`${coders.deletionRequest} IS NOT NULL`))
    .returning({ id: coders.id });
  return rows.length > 0;
}

/** The study's deletion log, newest first. */
export async function listCoderDeletions(db: Db, studyId: number): Promise<CoderDeletion[]> {
  return db
    .select({
      coderId: coderDeletions.coderId,
      participantId: coderDeletions.participantId,
      email: coderDeletions.email,
      requestedAt: coderDeletions.requestedAt,
      deletedAt: coderDeletions.deletedAt,
      deletedBy: coderDeletions.deletedBy,
      answers: coderDeletions.answers,
    })
    .from(coderDeletions)
    .where(eq(coderDeletions.studyId, studyId))
    .orderBy(desc(coderDeletions.deletedAt), desc(coderDeletions.id));
}
