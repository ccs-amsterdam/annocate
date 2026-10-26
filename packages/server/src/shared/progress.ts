import type { CoderProgress, JobOverview, SessionEnd, VariableValue } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { getDeployment, loopVariables } from "./deployments.js";

const DAY_MS = 24 * 60 * 60_000;
const ACTIVITY_DAYS = 30;

/**
 * Coder id -> units finished, per loop of the live codebook: every question
 * of the loop has a live answer (the rule of `listFinished`).
 */
export async function finishedPerLoop(sql: Sql, jobId: number): Promise<Map<string, Map<number, number>>> {
  const result = new Map<string, Map<number, number>>();
  const deployment = await getDeployment(sql, jobId);
  if (!deployment) return result;
  for (const [loop, questions] of await loopVariables(sql, jobId, deployment.codebookId)) {
    const variables = [...new Set(questions)];
    if (variables.length === 0) continue;
    const rows = await sql.query<{ coderId: number; n: number }>(
      `SELECT coder_id AS "coderId", COUNT(*)::int AS n FROM (
         SELECT unit_id, coder_id FROM annotation_values
         WHERE job_id = $1 AND retired_at IS NULL AND variable = ANY($2)
         GROUP BY unit_id, coder_id HAVING COUNT(DISTINCT variable) = $3
       ) finished GROUP BY coder_id`,
      [jobId, variables, variables.length],
    );
    result.set(loop, new Map(rows.map((r) => [r.coderId, r.n])));
  }
  return result;
}

/** `GET /coders`: every coder of the job with their invite, activity and finished units. */
export async function listCoderProgress(sql: Sql, jobId: number): Promise<CoderProgress[]> {
  const coders = await sql.query<{
    id: number;
    email: string | null;
    participantId: string | null;
    inviteId: number | null;
    created: Date;
    inviteLabel: string | null;
    variables: Record<string, VariableValue>;
    ended: SessionEnd | null;
  }>(
    `SELECT c.id, c.email, c.participant_id AS "participantId", c.invite_id AS "inviteId", c.created, i.label AS "inviteLabel",
       c.variables, c.ended
     FROM coders c LEFT JOIN invites i ON i.id = c.invite_id
     WHERE c.job_id = $1 ORDER BY c.id`,
    [jobId],
  );
  const activity = new Map(
    (
      await sql.query<{ coderId: number; answers: number; lastActive: Date }>(
        `SELECT coder_id AS "coderId", COUNT(*)::int AS answers, MAX(updated) AS "lastActive" FROM annotation_values
         WHERE job_id = $1 AND retired_at IS NULL GROUP BY coder_id`,
        [jobId],
      )
    ).map((r) => [r.coderId, r]),
  );
  const finished = await finishedPerLoop(sql, jobId);

  return coders.map((c) => ({
    id: c.id,
    ...(c.email ? { email: c.email } : {}),
    ...(c.participantId ? { participantId: c.participantId } : {}),
    inviteId: c.inviteId,
    inviteLabel: c.inviteLabel,
    started: c.created,
    lastActive: activity.get(c.id)?.lastActive ?? null,
    answers: activity.get(c.id)?.answers ?? 0,
    finished: Object.fromEntries([...finished].map(([loop, perCoder]) => [loop, perCoder.get(c.id) ?? 0])),
    variables: c.variables,
    ended: c.ended,
  }));
}

/** `GET /overview`: counts and the last 30 days of activity. */
export async function jobOverview(sql: Sql, jobId: number, now = new Date()): Promise<JobOverview> {
  const count = async (text: string, ...args: unknown[]) => (await one<{ n: number }>(sql, text, [jobId, ...args]))!.n;
  const dayAgo = new Date(now.getTime() - DAY_MS);

  const unitsets = await sql.query<{ name: string; units: number }>(
    "SELECT name, cardinality(unit_ids) AS units FROM unitsets WHERE job_id = $1 ORDER BY id",
    [jobId],
  );
  const lastActivity = (
    await one<{ last: Date | null }>(sql, "SELECT MAX(updated) AS last FROM annotation_values WHERE job_id = $1 AND retired_at IS NULL", [jobId])
  )!.last;

  let codings = 0;
  for (const perCoder of (await finishedPerLoop(sql, jobId)).values()) for (const n of perCoder.values()) codings += n;

  return {
    units: await count("SELECT COUNT(*)::int AS n FROM units WHERE job_id = $1"),
    unitsets,
    coders: {
      total: await count("SELECT COUNT(*)::int AS n FROM coders WHERE job_id = $1"),
      started: await count("SELECT COUNT(DISTINCT coder_id)::int AS n FROM annotation_values WHERE job_id = $1 AND retired_at IS NULL"),
      activeLastDay: await count(
        "SELECT COUNT(DISTINCT coder_id)::int AS n FROM annotation_values WHERE job_id = $1 AND retired_at IS NULL AND updated >= $2",
        dayAgo,
      ),
    },
    answers: await count("SELECT COUNT(*)::int AS n FROM annotation_values WHERE job_id = $1 AND retired_at IS NULL"),
    codings,
    lastActivity,
    activity: await activityPerDay(sql, jobId, now),
  };
}

/** Answers given per day (UTC; by creation, including ones retired later), with empty days filled in. */
async function activityPerDay(sql: Sql, jobId: number, now: Date): Promise<JobOverview["activity"]> {
  const days: string[] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) days.push(new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  const rows = await sql.query<{ day: string; answers: number; coders: number }>(
    `SELECT to_char(created AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS answers, COUNT(DISTINCT coder_id)::int AS coders
     FROM annotation_values WHERE job_id = $1 AND created >= $2 GROUP BY day`,
    [jobId, new Date(`${days[0]}T00:00:00Z`)],
  );
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((day) => ({ day, answers: byDay.get(day)?.answers ?? 0, coders: byDay.get(day)?.coders ?? 0 }));
}
