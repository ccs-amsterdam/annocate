import type { Limits } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { effectiveLimits, getSettings, usage } from "./accounts.js";
import { HttpError } from "./http.js";

// Limits (docs/accounts.md): a job's owner's plan says how much the job may
// hold; the server's settings how large one unit or answer may be. Checked
// when something is added; nothing is removed when limits shrink.

/** The limits of a job's owner (no owner: none), and the owner's id. */
export async function jobLimits(sql: Sql, jobId: number): Promise<{ ownerId: number | null; limits: Limits }> {
  const job = await one<{ owner_id: number | null }>(sql, "SELECT owner_id FROM jobs WHERE id = $1", [jobId]);
  if (!job?.owner_id) return { ownerId: null, limits: {} };
  return { ownerId: job.owner_id, limits: await effectiveLimits(sql, job.owner_id) };
}

const limitReached = (message: string) => new HttpError(403, message, "limit_reached");

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/** Refuses an upload that adds `added` units past the job's or its owner's limits, or a unit larger than the server allows. */
export async function checkUnitUpload(sql: Sql, jobId: number, units: { externalId: string; data: unknown }[], added: number): Promise<void> {
  const { unitBytes } = await getSettings(sql);
  for (const unit of units) {
    const bytes = Buffer.byteLength(JSON.stringify(unit.data));
    if (bytes > unitBytes) {
      throw new HttpError(413, `Unit '${unit.externalId}' takes ${size(bytes)}; a unit can take at most ${size(unitBytes)} on this server`, "unit_too_large");
    }
  }
  if (added === 0) return;
  const { ownerId, limits } = await jobLimits(sql, jobId);
  if (limits.unitsPerJob != null) {
    const row = await one<{ n: number }>(sql, "SELECT count(*)::int AS n FROM units WHERE job_id = $1", [jobId]);
    if (row!.n + added > limits.unitsPerJob) throw limitReached(`A job can have at most ${limits.unitsPerJob} units (this one has ${row!.n})`);
  }
  if (limits.units != null && ownerId !== null) {
    const { units } = await usage(sql, ownerId);
    if (units + added > limits.units) throw limitReached(`The job's owner can have at most ${limits.units} units in all their jobs (now ${units})`);
  }
}

/** Refuses a new coder past the job's limit. */
export async function checkNewCoder(sql: Sql, jobId: number): Promise<void> {
  const { limits } = await jobLimits(sql, jobId);
  if (limits.codersPerJob == null) return;
  const row = await one<{ n: number }>(sql, "SELECT count(*)::int AS n FROM coders WHERE job_id = $1", [jobId]);
  if (row!.n >= limits.codersPerJob) throw new HttpError(403, "This job doesn't take new coders any more", "job_full");
}

/** Refuses an answer larger than the server allows. */
export function checkAnswerSize(name: string, value: unknown, answerBytes: number): void {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > answerBytes) throw new HttpError(413, `The answer to '${name}' takes ${size(bytes)}; at most ${size(answerBytes)}`, "answer_too_large");
}
