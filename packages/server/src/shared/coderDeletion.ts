import { and, desc, eq, exists, inArray, notExists, or, sql } from "drizzle-orm";
import { sha256Hex } from "./crypto.js";
import {
  CODER_SET,
  isEmail,
  linkKey,
  type CoderDeletion,
  type DeleteCoders,
  type DeleteCodersResponse,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { lockUnits } from "../db/locks.js";
import { anyOf } from "../db/sql.js";
import {
  annotationValues as a,
  coderSessions,
  coders,
  links,
  sessionDeletions,
  unitSets,
  units,
} from "../db/schema/index.js";

/**
 * Deletes coders' sessions and everything they answered, for good (a coder
 * withdrew, docs/coder-identity.md §8), selected by session id, coder id or
 * email within the study. Named by coder id (or by the email address the
 * researchers gave them) the coder goes too (`removeCoders`). A crowd's
 * coder whose last session is deleted is removed as well: nothing of them
 * stays. Each deleted session is logged (`session_deletions`).
 */
export async function deleteCoders(
  db: Db,
  studyId: number,
  select: DeleteCoders,
  deletedBy: string | null,
): Promise<DeleteCodersResponse> {
  return db.transaction(async (tx) => {
    const named = await namedCoders(tx, studyId, select);
    const sessions = await selectedSessions(tx, studyId, select, named);
    const answers = await deleteSessions(tx, studyId, sessions, deletedBy);
    const left = (await crowdCodersWithoutSessions(tx, studyId, sessions)).filter((c) => !named.includes(c));
    await removeCoders(tx, studyId, named);
    await removeCoders(tx, studyId, left);
    return { sessionIds: sessions.map((s) => s.id), answers, coders: [...named, ...left] };
  });
}

/** The study's coders a deletion names: by coder id, or by the email address the researchers gave them. */
async function namedCoders(db: Db, studyId: number, select: DeleteCoders): Promise<string[]> {
  const emails = (select.emails ?? []).map((e) => e.toLowerCase());
  const found = await db
    .select({ coder: coders.coder })
    .from(coders)
    .where(
      and(
        eq(coders.studyId, studyId),
        or(inArray(coders.coder, select.coders ?? []), inArray(sql`lower(${coders.email})`, emails)),
      ),
    );
  return found.map((c) => c.coder);
}

/** A session to delete: its id and its coder. */
interface Selected {
  id: number;
  coder: string | null;
}

/** The sessions a deletion selects: by id, by the email they signed in with, and every session of the named coders. */
function selectedSessions(db: Db, studyId: number, select: DeleteCoders, named: string[]): Promise<Selected[]> {
  const emails = (select.emails ?? []).map((e) => e.toLowerCase());
  return db
    .select({ id: coderSessions.id, coder: coderSessions.coder })
    .from(coderSessions)
    .where(
      and(
        eq(coderSessions.studyId, studyId),
        or(
          inArray(coderSessions.id, select.sessionIds ?? []),
          inArray(coderSessions.coder, [...(select.coders ?? []), ...named]),
          inArray(sql`lower(${coderSessions.email})`, emails),
        ),
      ),
    );
}

/**
 * Deletes sessions (with their coder-level answers, routing and deletion
 * request) and all their answer rows, also retired ones; returns how many
 * answers. Units nobody has answers for any more can be deleted again. Unit
 * versions stay: they hold unit content, not the coder's. Each session is
 * logged with the ids downloaded results use; never an email address
 * (`loggedCoder`).
 */
async function deleteSessions(db: Db, studyId: number, sessions: Selected[], deletedBy: string | null) {
  const ids = sessions.map((s) => s.id);
  if (ids.length === 0) return 0;
  const theirs = and(eq(coderSessions.studyId, studyId), inArray(coderSessions.id, ids));
  const logged = await db
    .select({
      studyId: coderSessions.studyId,
      sessionId: coderSessions.id,
      coder: coderSessions.coder,
      requestedAt: coderSessions.deletionRequest,
      answers: sql<number>`(${db
        .select({ n: sql`count(*)::int` })
        .from(a)
        .where(and(eq(a.studyId, coderSessions.studyId), eq(a.sessionId, coderSessions.id)))})`,
    })
    .from(coderSessions)
    .where(theirs);
  await db.insert(sessionDeletions).values(
    logged.map((c) => ({
      ...c,
      coder: loggedCoder(c.coder),
      requestedAt: c.requestedAt ? new Date(c.requestedAt.at) : null,
      deletedBy,
    })),
  );
  const removed = await db
    .delete(a)
    .where(and(eq(a.studyId, studyId), inArray(a.sessionId, ids)))
    .returning({ unitId: a.unitId });
  await db.delete(coderSessions).where(theirs);
  const touched = [...new Set(removed.flatMap((r) => (r.unitId === null ? [] : [r.unitId])))];
  await db
    .update(units)
    .set({
      coded: exists(
        db
          .select({ one: sql`1` })
          .from(a)
          .where(eq(a.unitId, units.id)),
      ),
    })
    .where(and(eq(units.studyId, studyId), anyOf(units.id, touched)));
  return removed.length;
}

/** The crowd's coders among the deleted sessions' who have no session left. */
async function crowdCodersWithoutSessions(db: Db, studyId: number, deleted: Selected[]): Promise<string[]> {
  const theirs = [...new Set(deleted.flatMap((s) => (s.coder === null ? [] : [s.coder])))];
  if (theirs.length === 0) return [];
  const sessions = db
    .select({ one: sql`1` })
    .from(coderSessions)
    .where(and(eq(coderSessions.studyId, coders.studyId), eq(coderSessions.coder, coders.coder)));
  const found = await db
    .select({ coder: coders.coder })
    .from(coders)
    .where(
      and(eq(coders.studyId, studyId), eq(coders.kind, "crowd"), inArray(coders.coder, theirs), notExists(sessions)),
    );
  return found.map((c) => c.coder);
}

/**
 * Removes coders from the study: their row (with their email address), their
 * units in the draft's and the deployed `coder_set` (those units have no
 * coder until the researchers divide them again), and their own link, which
 * is revoked. The ids can be made again afterwards.
 */
async function removeCoders(db: Db, studyId: number, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await lockUnits(db, studyId, "write");
  await db
    .delete(unitSets)
    .where(and(eq(unitSets.studyId, studyId), eq(unitSets.grp, CODER_SET), inArray(unitSets.name, ids)));
  await db
    .update(links)
    .set({ revokedAt: sql`COALESCE(${links.revokedAt}, now())` })
    .where(
      and(
        eq(links.studyId, studyId),
        inArray(
          links.linkKey,
          ids.map((coder) => linkKey({ coder })),
        ),
      ),
    );
  await db.delete(coders).where(and(eq(coders.studyId, studyId), inArray(coders.coder, ids)));
}

/**
 * A deleted coder's id as the deletion log keeps it. A coder id that looks
 * like an email address (a crowd that signs in, or an id the researchers
 * chose) is kept as `sha256:<hash of the address in lower case>`, which
 * finds the coder in results downloaded earlier (hash the ids there) and
 * names nobody.
 */
export function loggedCoder(coder: string | null): string | null {
  if (coder === null || !isEmail(coder)) return coder;
  return `sha256:${sha256Hex(coder.toLowerCase())}`;
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
