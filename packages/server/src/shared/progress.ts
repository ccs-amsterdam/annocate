import { listSetGroups } from "./sets.js";
import { loopShareColumns, type CoderProgress, type DeletionRequest, type StudyOverview, type SessionEnd } from "@annotinder/contracts";
import { designVersionItems } from "./designVersions.js";
import { one, type Sql } from "../db.js";
import { getDeployment, loopVariables } from "./deployments.js";
import { coderValues } from "./coders.js";

const DAY_MS = 24 * 60 * 60_000;
const ACTIVITY_DAYS = 30;

/**
 * Coder id -> units finished, per loop of the live codebook: every question
 * of the loop has a live answer (the rule of `listFinished`).
 */
export async function finishedPerLoop(sql: Sql, studyId: number): Promise<Map<string, Map<number, number>>> {
  const result = new Map<string, Map<number, number>>();
  const deployment = await getDeployment(sql, studyId);
  if (!deployment) return result;
  for (const [loop, questions] of await loopVariables(sql, studyId, deployment.designVersionId)) {
    const variables = [...new Set(questions)];
    if (variables.length === 0) continue;
    const rows = await sql.query<{ coderId: number; n: number }>(
      `SELECT coder_id AS "coderId", COUNT(*)::int AS n FROM (
         SELECT unit_id, coder_id FROM annotation_values
         WHERE study_id = $1 AND unit_id IS NOT NULL AND retired_at IS NULL AND variable = ANY($2)
         GROUP BY unit_id, coder_id HAVING COUNT(DISTINCT variable) = $3
       ) finished GROUP BY coder_id`,
      [studyId, variables, variables.length],
    );
    result.set(loop, new Map(rows.map((r) => [r.coderId, r.n])));
  }
  return result;
}

/** `GET /coders`: every coder of the study with their link, activity and finished units. */
export async function listCoderProgress(sql: Sql, studyId: number): Promise<CoderProgress[]> {
  const coders = await sql.query<{
    id: number;
    email: string | null;
    participantId: string | null;
    linkId: number | null;
    created: Date;
    linkLabel: string | null;
    ended: SessionEnd | null;
    deletionRequest: DeletionRequest | null;
    session: Record<string, string>;
    assignments: Record<string, unknown>;
  }>(
    `SELECT c.id, c.email, c.participant_id AS "participantId", c.link_id AS "linkId", c.created, i.label AS "linkLabel",
       c.ended, c.deletion_request AS "deletionRequest", c.session, c.assignments
     FROM coders c LEFT JOIN links i ON i.id = c.link_id
     WHERE c.study_id = $1 ORDER BY c.id`,
    [studyId],
  );
  const activity = new Map(
    (
      await sql.query<{ coderId: number; answers: number; lastActive: Date }>(
        `SELECT coder_id AS "coderId", COUNT(*)::int AS answers, MAX(updated) AS "lastActive" FROM annotation_values
         WHERE study_id = $1 AND retired_at IS NULL AND NOT assigned GROUP BY coder_id`,
        [studyId],
      )
    ).map((r) => [r.coderId, r]),
  );
  const finished = await finishedPerLoop(sql, studyId);
  const values = await coderValues(sql, studyId);
  // Special units as deployed (docs/plans/unit-assignment.md): practice and gold units of any set
  // column are everyone's; the overlap is that of the columns the coder's session values select
  // units by. Counted for coders who were routed in a loop.
  const kinds = { _overlap: "overlap", _gold: "gold", _practice: "practice" } as const;
  type Kind = keyof typeof kinds;
  const members = await sql.query<{ grp: string; name: Kind; unitId: number }>(
    `SELECT s.grp, s.name, m.unit_id AS "unitId" FROM unit_sets s JOIN unit_set_members m ON m.set_id = s.id
     WHERE s.study_id = $1 AND s.live AND s.name IN ('_overlap', '_gold', '_practice')`,
    [studyId],
  );
  const doneRows = await sql.query<{ coderId: number; unitId: number }>(
    `SELECT DISTINCT coder_id AS "coderId", unit_id AS "unitId" FROM unit_codings WHERE study_id = $1 AND unit_id = ANY($2)`,
    [studyId, [...new Set(members.map((m) => m.unitId))]],
  );
  const done = new Map<number, Set<number>>();
  for (const r of doneRows) done.set(r.coderId, (done.get(r.coderId) ?? new Set()).add(r.unitId));
  const deployment = await getDeployment(sql, studyId);
  const deployed = deployment
    ? await one<{ items: unknown; session: unknown }>(sql, "SELECT items, session FROM design_versions WHERE id = $1", [deployment.designVersionId])
    : null;
  const shareColumns = deployed ? [...new Map([...loopShareColumns(designVersionItems(deployed)).values()].flat().map((c) => [c.name, c.column]))] : [];
  const special = (coderId: number, session: Record<string, string>, assignments: Record<string, unknown>) => {
    const out: CoderProgress["special"] = {};
    if (Object.keys(assignments ?? {}).length === 0) return out;
    const selected = shareColumns.filter(([name]) => session?.[name] !== undefined).map(([, column]) => column);
    // The session's columns, or (no column divides its units) every column
    const overlapColumns = new Set(selected.length > 0 ? selected : members.map((m) => m.grp));
    for (const [name, kind] of Object.entries(kinds) as [Kind, (typeof kinds)[Kind]][]) {
      const units = new Set(members.filter((m) => m.name === name && (name !== "_overlap" || overlapColumns.has(m.grp))).map((m) => m.unitId));
      if (units.size === 0) continue;
      out[kind] = { done: [...units].filter((id) => done.get(coderId)?.has(id)).length, total: units.size };
    }
    return out;
  };

  return coders.map((c) => ({
    id: c.id,
    ...(c.email ? { email: c.email } : {}),
    ...(c.participantId ? { participantId: c.participantId } : {}),
    linkId: c.linkId,
    linkLabel: c.linkLabel,
    started: c.created,
    lastActive: activity.get(c.id)?.lastActive ?? null,
    answers: activity.get(c.id)?.answers ?? 0,
    finished: Object.fromEntries([...finished].map(([loop, perCoder]) => [loop, perCoder.get(c.id) ?? 0])),
    special: special(c.id, c.session, c.assignments),
    variables: values.get(c.id) ?? {},
    ended: c.ended,
    deletionRequest: c.deletionRequest,
    session: c.session,
  }));
}

/** `GET /overview`: counts and the last 30 days of activity. */
export async function studyOverview(sql: Sql, studyId: number, now = new Date()): Promise<StudyOverview> {
  const count = async (text: string, ...args: unknown[]) => (await one<{ n: number }>(sql, text, [studyId, ...args]))!.n;
  const dayAgo = new Date(now.getTime() - DAY_MS);

  const groups = (await listSetGroups(sql, studyId)).map((g) => ({ name: g.name, sets: g.sets.map((s) => ({ name: s.name, units: s.unitIds.length })) }));
  const lastActivity = (
    await one<{ last: Date | null }>(sql, "SELECT MAX(updated) AS last FROM annotation_values WHERE study_id = $1 AND retired_at IS NULL AND NOT assigned", [studyId])
  )!.last;

  let codings = 0;
  for (const perCoder of (await finishedPerLoop(sql, studyId)).values()) for (const n of perCoder.values()) codings += n;

  return {
    units: await count("SELECT COUNT(*)::int AS n FROM units WHERE study_id = $1 AND in_draft"),
    groups,
    coders: {
      total: await count("SELECT COUNT(*)::int AS n FROM coders WHERE study_id = $1"),
      started: await count("SELECT COUNT(DISTINCT coder_id)::int AS n FROM annotation_values WHERE study_id = $1 AND retired_at IS NULL AND NOT assigned"),
      activeLastDay: await count(
        "SELECT COUNT(DISTINCT coder_id)::int AS n FROM annotation_values WHERE study_id = $1 AND retired_at IS NULL AND NOT assigned AND updated >= $2",
        dayAgo,
      ),
    },
    answers: await count("SELECT COUNT(*)::int AS n FROM annotation_values WHERE study_id = $1 AND retired_at IS NULL AND NOT assigned"),
    codings,
    lastActivity,
    activity: await activityPerDay(sql, studyId, now),
  };
}

/** Answers given per day (UTC; by creation, including ones retired later), with empty days filled in. */
async function activityPerDay(sql: Sql, studyId: number, now: Date): Promise<StudyOverview["activity"]> {
  const days: string[] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) days.push(new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  const rows = await sql.query<{ day: string; answers: number; coders: number }>(
    `SELECT to_char(created AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS answers, COUNT(DISTINCT coder_id)::int AS coders
     FROM annotation_values WHERE study_id = $1 AND NOT assigned AND created >= $2 GROUP BY day`,
    [studyId, new Date(`${days[0]}T00:00:00Z`)],
  );
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((day) => ({ day, answers: byDay.get(day)?.answers ?? 0, coders: byDay.get(day)?.coders ?? 0 }));
}
