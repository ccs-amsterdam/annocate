import type { Limits } from "@annotinder/contracts";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { coderSessions, studies, units as unitsTable } from "../db/schema/index.js";
import { effectiveLimits, getSettings, usage } from "./accounts.js";
import { HttpError } from "./http.js";

// Limits (docs/accounts.md): a study's owner's plan says how much the study may
// hold; the server's settings how large one unit or answer may be. Checked
// when something is added; nothing is removed when limits shrink.

/** The limits of a study's owner (no owner: none), and the owner's id. */
export async function studyLimits(db: Db, studyId: number): Promise<{ ownerId: number | null; limits: Limits }> {
  const [study] = await db.select({ ownerId: studies.ownerId }).from(studies).where(eq(studies.id, studyId));
  if (!study?.ownerId) return { ownerId: null, limits: {} };
  return { ownerId: study.ownerId, limits: await effectiveLimits(db, study.ownerId) };
}

const limitReached = (message: string) => new HttpError(403, message, "limit_reached");

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

/** Refuses an upload that adds `added` units past the study's or its owner's limits, or a unit larger than the server allows. */
export async function checkUnitUpload(
  db: Db,
  studyId: number,
  units: { externalId: string; data: unknown }[],
  added: number,
): Promise<void> {
  const { unitBytes } = await getSettings(db);
  for (const unit of units) {
    const bytes = Buffer.byteLength(JSON.stringify(unit.data));
    if (bytes > unitBytes) {
      throw new HttpError(
        413,
        `Unit '${unit.externalId}' takes ${size(bytes)}; a unit can take at most ${size(unitBytes)} on this server`,
        "unit_too_large",
      );
    }
  }
  if (added === 0) return;
  const { ownerId, limits } = await studyLimits(db, studyId);
  if (limits.unitsPerStudy != null) {
    const n = await db.$count(unitsTable, and(eq(unitsTable.studyId, studyId), eq(unitsTable.inDraft, true)));
    if (n + added > limits.unitsPerStudy)
      throw limitReached(`A study can have at most ${limits.unitsPerStudy} units (this one has ${n})`);
  }
  if (limits.units != null && ownerId !== null) {
    const { units } = await usage(db, ownerId);
    if (units + added > limits.units)
      throw limitReached(
        `The study's owner can have at most ${limits.units} units in all their studies (now ${units})`,
      );
  }
}

/** Refuses a new coder past the study's limit. */
export async function checkNewCoder(db: Db, studyId: number): Promise<void> {
  const { limits } = await studyLimits(db, studyId);
  if (limits.codersPerStudy == null) return;
  if ((await db.$count(coderSessions, eq(coderSessions.studyId, studyId))) >= limits.codersPerStudy)
    throw new HttpError(403, "This study doesn't take new coders any more", "study_full");
}

/** Refuses an answer larger than the server allows. */
export function checkAnswerSize(name: string, value: unknown, answerBytes: number): void {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > answerBytes)
    throw new HttpError(
      413,
      `The answer to '${name}' takes ${size(bytes)}; at most ${size(answerBytes)}`,
      "answer_too_large",
    );
}

/** Refuses an imported study (already written, in the caller's transaction) past its owner's limits on units and coders. */
export async function checkImportedStudy(db: Db, studyId: number): Promise<void> {
  const { ownerId, limits } = await studyLimits(db, studyId);
  if (limits.unitsPerStudy != null) {
    const n = await db.$count(unitsTable, and(eq(unitsTable.studyId, studyId), eq(unitsTable.inDraft, true)));
    if (n > limits.unitsPerStudy)
      throw limitReached(`A study can have at most ${limits.unitsPerStudy} units; this one has ${n}`);
  }
  if (limits.units != null && ownerId !== null) {
    const { units } = await usage(db, ownerId);
    if (units > limits.units)
      throw limitReached(`You can have at most ${limits.units} units in all your studies; with this one, ${units}`);
  }
  if (limits.codersPerStudy != null) {
    const n = await db.$count(coderSessions, eq(coderSessions.studyId, studyId));
    if (n > limits.codersPerStudy)
      throw limitReached(`A study can have at most ${limits.codersPerStudy} coders; this one has ${n}`);
  }
}
