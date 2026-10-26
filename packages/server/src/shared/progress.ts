import type { DatabaseSync } from "node:sqlite";
import type { CoderProgress, JobOverview } from "@annotinder/contracts";
import { placeholders } from "../db.js";
import { getDeployment, loopVariables } from "./deployments.js";

const DAY_MS = 24 * 60 * 60_000;
const ACTIVITY_DAYS = 30;

/**
 * Coder id -> units finished, per loop of the live codebook: every question
 * of the loop has a live answer (the rule of the backend `finished` endpoint).
 */
export function finishedPerLoop(db: DatabaseSync, jobId: number): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();
  const deployment = getDeployment(db, jobId);
  if (!deployment) return result;
  for (const [loop, questions] of loopVariables(db, jobId, deployment.codebookId)) {
    const variables = [...new Set(questions)];
    if (variables.length === 0) continue;
    const rows = db
      .prepare(
        `SELECT coderId, COUNT(*) AS n FROM (
           SELECT unitId, coderId FROM annotation_values
           WHERE jobId = ? AND retiredAt IS NULL AND variable IN (${placeholders(variables.length)})
           GROUP BY unitId, coderId HAVING COUNT(DISTINCT variable) = ?
         ) GROUP BY coderId`,
      )
      .all(jobId, ...variables, variables.length) as unknown as { coderId: number; n: number }[];
    result.set(loop, new Map(rows.map((r) => [r.coderId, r.n])));
  }
  return result;
}

/** `GET /coders`: every coder of the job with their invite, activity and finished units. */
export function listCoderProgress(db: DatabaseSync, jobId: number): CoderProgress[] {
  const coders = db
    .prepare(
      `SELECT c.id, c.email, c.participantId, c.inviteId, c.created, i.label AS inviteLabel
       FROM coders c LEFT JOIN invites i ON i.id = c.inviteId
       WHERE c.jobId = ? ORDER BY c.id`,
    )
    .all(jobId) as unknown as {
    id: number;
    email: string | null;
    participantId: string | null;
    inviteId: number | null;
    created: string | null;
    inviteLabel: string | null;
  }[];
  const activity = new Map(
    (
      db
        .prepare(
          `SELECT coderId, COUNT(*) AS answers, MAX(updated) AS lastActive FROM annotation_values
           WHERE jobId = ? AND retiredAt IS NULL GROUP BY coderId`,
        )
        .all(jobId) as unknown as { coderId: number; answers: number; lastActive: string }[]
    ).map((r) => [r.coderId, r]),
  );
  const finished = finishedPerLoop(db, jobId);

  return coders.map((c) => ({
    id: c.id,
    ...(c.email ? { email: c.email } : {}),
    ...(c.participantId ? { participantId: c.participantId } : {}),
    inviteId: c.inviteId,
    inviteLabel: c.inviteLabel,
    started: c.created ? new Date(c.created) : null,
    lastActive: activity.has(c.id) ? new Date(activity.get(c.id)!.lastActive) : null,
    answers: activity.get(c.id)?.answers ?? 0,
    finished: Object.fromEntries([...finished].map(([loop, perCoder]) => [loop, perCoder.get(c.id) ?? 0])),
  }));
}

/** `GET /overview`: counts and the last 30 days of activity. */
export function jobOverview(db: DatabaseSync, jobId: number, now = new Date()): JobOverview {
  const count = (sql: string, ...args: (string | number)[]) =>
    (db.prepare(sql).get(jobId, ...args) as { n: number }).n;
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();

  const unitsets = (
    db.prepare("SELECT name, unitIds FROM unitsets WHERE jobId = ? ORDER BY id").all(jobId) as unknown as {
      name: string;
      unitIds: string;
    }[]
  ).map((u) => ({ name: u.name, units: (JSON.parse(u.unitIds) as number[]).length }));

  const lastActivity = (
    db.prepare("SELECT MAX(updated) AS last FROM annotation_values WHERE jobId = ? AND retiredAt IS NULL").get(jobId) as {
      last: string | null;
    }
  ).last;

  let codings = 0;
  for (const perCoder of finishedPerLoop(db, jobId).values()) for (const n of perCoder.values()) codings += n;

  return {
    units: count("SELECT COUNT(*) AS n FROM units WHERE jobId = ?"),
    unitsets,
    coders: {
      total: count("SELECT COUNT(*) AS n FROM coders WHERE jobId = ?"),
      started: count("SELECT COUNT(DISTINCT coderId) AS n FROM annotation_values WHERE jobId = ? AND retiredAt IS NULL"),
      activeLastDay: count(
        "SELECT COUNT(DISTINCT coderId) AS n FROM annotation_values WHERE jobId = ? AND retiredAt IS NULL AND updated >= ?",
        dayAgo,
      ),
    },
    answers: count("SELECT COUNT(*) AS n FROM annotation_values WHERE jobId = ? AND retiredAt IS NULL"),
    codings,
    lastActivity: lastActivity ? new Date(lastActivity) : null,
    activity: activityPerDay(db, jobId, now),
  };
}

/** Answers given per day (by creation; including ones retired later), with empty days filled in. */
function activityPerDay(db: DatabaseSync, jobId: number, now: Date): JobOverview["activity"] {
  const days: string[] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) days.push(new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  const rows = db
    .prepare(
      `SELECT substr(created, 1, 10) AS day, COUNT(*) AS answers, COUNT(DISTINCT coderId) AS coders
       FROM annotation_values WHERE jobId = ? AND created >= ? GROUP BY day`,
    )
    .all(jobId, days[0]) as unknown as { day: string; answers: number; coders: number }[];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((day) => ({ day, answers: byDay.get(day)?.answers ?? 0, coders: byDay.get(day)?.coders ?? 0 }));
}
