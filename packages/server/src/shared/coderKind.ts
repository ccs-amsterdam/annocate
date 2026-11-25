import { inviteKind, inviteOf, sessionItem, type CoderKind } from "@annotinder/contracts";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { coders, studies } from "../db/schema/index.js";
import { removeCoders } from "./coderDeletion.js";
import { HttpError } from "./http.js";

// Who codes in a study, expert coders or a crowd (docs/architecture.md
// §6.1): the design's invitation chooses, and the study's first deploy
// records the deployed design's kind (`studies.coder_kind`) and fixes it.

/** The kind of coders a study's first deploy fixed; null before it. 404 for a study that doesn't exist. */
export async function studyCoderKind(db: Db, studyId: number): Promise<CoderKind | null> {
  const [study] = await db.select({ coderKind: studies.coderKind }).from(studies).where(eq(studies.id, studyId));
  if (!study) throw new HttpError(404, "Study not found");
  return study.coderKind;
}

/**
 * A study's first deploy: records the kind of coders the deployed design
 * invites (`items`: with its Study entry, who codes chosen). A crowd's:
 * expert coders made before aren't used, and are deleted
 * (`deleteExpertCoders`).
 */
export async function recordCoderKind(db: Db, studyId: number, items: readonly unknown[]): Promise<void> {
  const invite = inviteOf(sessionItem(items));
  if (invite === null) throw new HttpError(400, "The design hasn't chosen who codes", "design_invalid");
  const coderKind = inviteKind(invite);
  await db.update(studies).set({ coderKind }).where(eq(studies.id, studyId));
  if (coderKind === "crowd") await deleteExpertCoders(db, studyId);
}

/** Deletes a study's expert coders (before its first deploy: they have no sessions), with their email addresses and their units in `coder_set`. */
async function deleteExpertCoders(db: Db, studyId: number): Promise<void> {
  const experts = await db
    .select({ coder: coders.coder })
    .from(coders)
    .where(and(eq(coders.studyId, studyId), eq(coders.kind, "expert")));
  await removeCoders(
    db,
    studyId,
    experts.map((c) => c.coder),
  );
}
