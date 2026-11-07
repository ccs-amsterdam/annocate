import type { Limits } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { effectiveLimits, getSettings, usage } from "./accounts.js";
import { HttpError } from "./http.js";

// Limits (docs/accounts.md): a study's owner's plan says how much the study may
// hold; the server's settings how large one unit or answer may be. Checked
// when something is added; nothing is removed when limits shrink.

/** The limits of a study's owner (no owner: none), and the owner's id. */
export async function studyLimits(sql: Sql, studyId: number): Promise<{ ownerId: number | null; limits: Limits }> {
  const study = await one<{ owner_id: number | null }>(sql, "SELECT owner_id FROM studies WHERE id = $1", [studyId]);
  if (!study?.owner_id) return { ownerId: null, limits: {} };
  return { ownerId: study.owner_id, limits: await effectiveLimits(sql, study.owner_id) };
}

const limitReached = (message: string) => new HttpError(403, message, "limit_reached");

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/** Refuses an upload that adds `added` units past the study's or its owner's limits, or a unit larger than the server allows. */
export async function checkUnitUpload(sql: Sql, studyId: number, units: { externalId: string; data: unknown }[], added: number): Promise<void> {
  const { unitBytes } = await getSettings(sql);
  for (const unit of units) {
    const bytes = Buffer.byteLength(JSON.stringify(unit.data));
    if (bytes > unitBytes) {
      throw new HttpError(413, `Unit '${unit.externalId}' takes ${size(bytes)}; a unit can take at most ${size(unitBytes)} on this server`, "unit_too_large");
    }
  }
  if (added === 0) return;
  const { ownerId, limits } = await studyLimits(sql, studyId);
  if (limits.unitsPerStudy != null) {
    const row = await one<{ n: number }>(sql, "SELECT count(*)::int AS n FROM units WHERE study_id = $1 AND in_draft", [studyId]);
    if (row!.n + added > limits.unitsPerStudy) throw limitReached(`A study can have at most ${limits.unitsPerStudy} units (this one has ${row!.n})`);
  }
  if (limits.units != null && ownerId !== null) {
    const { units } = await usage(sql, ownerId);
    if (units + added > limits.units) throw limitReached(`The study's owner can have at most ${limits.units} units in all their studies (now ${units})`);
  }
}

/** Refuses a new coder past the study's limit. */
export async function checkNewCoder(sql: Sql, studyId: number): Promise<void> {
  const { limits } = await studyLimits(sql, studyId);
  if (limits.codersPerStudy == null) return;
  const row = await one<{ n: number }>(sql, "SELECT count(*)::int AS n FROM coders WHERE study_id = $1", [studyId]);
  if (row!.n >= limits.codersPerStudy) throw new HttpError(403, "This study doesn't take new coders any more", "study_full");
}

/** Refuses an answer larger than the server allows. */
export function checkAnswerSize(name: string, value: unknown, answerBytes: number): void {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > answerBytes) throw new HttpError(413, `The answer to '${name}' takes ${size(bytes)}; at most ${size(answerBytes)}`, "answer_too_large");
}
