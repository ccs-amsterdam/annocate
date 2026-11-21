import { and, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import type { CoderDeletion, DeleteCoders, DeleteCodersResponse } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { anyOf } from "../db/sql.js";
import { annotationValues as a, sessionDeletions, coderSessions, units } from "../db/schema/index.js";

/**
 * Deletes coders and everything they answered, for good (a coder
 * withdrew, docs/coder-identity.md): the coders (with their coder-level
 * answers, routing and deletion request) and all their answer rows, also
 * retired ones. Selected by session id, coder id or email, within the study.
 * Units nobody has answers for any more can be deleted again. Unit
 * versions stay: they hold unit content, not the coder's. Each deleted coder
 * is logged (`session_deletions`), with the ids downloaded results use (not
 * the email address).
 */
export async function deleteCoders(
  db: Db,
  studyId: number,
  select: DeleteCoders,
  deletedBy: string | null,
): Promise<DeleteCodersResponse> {
  return db.transaction(async (tx) => {
    const emails = (select.emails ?? []).map((e) => e.toLowerCase());
    const selected = await tx
      .select({ id: coderSessions.id })
      .from(coderSessions)
      .where(
        and(
          eq(coderSessions.studyId, studyId),
          or(
            inArray(coderSessions.id, select.sessionIds ?? []),
            inArray(coderSessions.coder, select.coders ?? []),
            inArray(sql`lower(${coderSessions.email})`, emails),
          ),
        ),
      );
    const ids = selected.map((c) => c.id);
    if (ids.length === 0) return { sessionIds: [], answers: 0 };
    const theirs = and(eq(coderSessions.studyId, studyId), inArray(coderSessions.id, ids));
    const logged = await tx
      .select({
        studyId: coderSessions.studyId,
        sessionId: coderSessions.id,
        coder: coderSessions.coder,
        requestedAt: coderSessions.deletionRequest,
        answers: sql<number>`(${tx
          .select({ n: sql`count(*)::int` })
          .from(a)
          .where(and(eq(a.studyId, coderSessions.studyId), eq(a.sessionId, coderSessions.id)))})`,
      })
      .from(coderSessions)
      .where(theirs);
    await tx
      .insert(sessionDeletions)
      .values(logged.map((c) => ({ ...c, requestedAt: c.requestedAt ? new Date(c.requestedAt.at) : null, deletedBy })));
    const removed = await tx
      .delete(a)
      .where(and(eq(a.studyId, studyId), inArray(a.sessionId, ids)))
      .returning({ unitId: a.unitId });
    await tx.delete(coderSessions).where(theirs);
    const touched = [...new Set(removed.flatMap((r) => (r.unitId === null ? [] : [r.unitId])))];
    await tx
      .update(units)
      .set({
        coded: exists(
          tx
            .select({ one: sql`1` })
            .from(a)
            .where(eq(a.unitId, units.id)),
        ),
      })
      .where(and(eq(units.studyId, studyId), anyOf(units.id, touched)));
    return { sessionIds: ids, answers: removed.length };
  });
}

/** Deletes later: the request stays, marked postponed, and is no longer brought up. Returns false if there is none. */
export async function postponeDeletion(db: Db, studyId: number, sessionId: number): Promise<boolean> {
  const rows = await db
    .update(coderSessions)
    .set({ deletionRequest: sql`${coderSessions.deletionRequest} || jsonb_build_object('postponedAt', now())` })
    .where(
      and(
        eq(coderSessions.studyId, studyId),
        eq(coderSessions.id, sessionId),
        sql`${coderSessions.deletionRequest} IS NOT NULL`,
      ),
    )
    .returning({ id: coderSessions.id });
  return rows.length > 0;
}

/** The study's deletion log, newest first. */
export async function listCoderDeletions(db: Db, studyId: number): Promise<CoderDeletion[]> {
  return db
    .select({
      sessionId: sessionDeletions.sessionId,
      coder: sessionDeletions.coder,
      requestedAt: sessionDeletions.requestedAt,
      deletedAt: sessionDeletions.deletedAt,
      deletedBy: sessionDeletions.deletedBy,
      answers: sessionDeletions.answers,
    })
    .from(sessionDeletions)
    .where(eq(sessionDeletions.studyId, studyId))
    .orderBy(desc(sessionDeletions.deletedAt), desc(sessionDeletions.id));
}
