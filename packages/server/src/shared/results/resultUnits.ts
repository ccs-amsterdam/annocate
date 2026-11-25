import { and, eq, inArray, sql } from "drizzle-orm";
import type { ResultUnit, ResultsUnit, SpanAnswer } from "@annotinder/contracts";
import { rows, type Db } from "../../db/index.js";
import { units } from "../../db/schema/index.js";
import { unitVersionData } from "../../db/sql.js";
import { deployedQuestions, live, loopAnswers, type Value } from "./liveAnswers.js";

// The units coders disagree on, and one unit's answers side by side.

/** An answer as a string to compare: identical answers, identical strings (values and spans in any order). */
function canonical(values: unknown, spans: unknown): string {
  const v = ((values ?? []) as { value: Value; item?: string }[]).map((x) => `${x.item ?? ""}=${String(x.value)}`);
  const s = ((spans ?? []) as SpanAnswer[]).flatMap((x) =>
    x.slices.map((sl) => `${x.field}:${x.value}:${sl.offset}:${sl.length}`),
  );
  return JSON.stringify([v.sort(), s.sort()]);
}

/** Units two or more coders answered, per loop, with the share of coder pairs answering differently (averaged over its questions). */
export async function resultUnits(db: Db, studyId: number): Promise<ResultUnit[]> {
  // Open answers nearly always differ: no disagreement to look at
  const questions = (await deployedQuestions(db, studyId)).filter(
    (q) => q.loop !== null && q.type.type !== "confirm" && q.type.type !== "text",
  );
  const byUnit = new Map<
    string,
    { unitId: number; loop: string; coders: Set<number>; sum: number; questions: number }
  >();
  for (const { name, type, loop } of questions) {
    const answers = await loopAnswers(db, studyId, name, type.type === "span");
    const perUnit = new Map<number, { session: number; answer: string }[]>();
    for (const a of answers) {
      const list = perUnit.get(a.unit) ?? [];
      list.push({ session: a.session, answer: canonical(a.values, a.spans) });
      perUnit.set(a.unit, list);
    }
    for (const [unitId, list] of perUnit) {
      if (list.length < 2) continue;
      const counts = new Map<string, number>();
      for (const { answer } of list) counts.set(answer, (counts.get(answer) ?? 0) + 1);
      const pairs = (list.length * (list.length - 1)) / 2;
      let same = 0;
      for (const n of counts.values()) same += (n * (n - 1)) / 2;
      const key = `${loop}/${unitId}`;
      const unit = byUnit.get(key) ?? { unitId, loop: loop!, coders: new Set(), sum: 0, questions: 0 };
      for (const { session } of list) unit.coders.add(session);
      unit.sum += 1 - same / pairs;
      unit.questions++;
      byUnit.set(key, unit);
    }
  }
  const ids = [...new Set([...byUnit.values()].map((u) => u.unitId))];
  const externalIds = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const found = await db
      .select({ id: units.id, externalId: units.externalId })
      .from(units)
      .where(inArray(units.id, ids.slice(i, i + 1000)));
    for (const { id, externalId } of found) externalIds.set(id, externalId);
  }
  return [...byUnit.values()]
    .map((u) => ({
      unitId: u.unitId,
      externalId: externalIds.get(u.unitId) ?? String(u.unitId),
      loop: u.loop,
      coders: u.coders.size,
      disagreement: u.sum / u.questions,
    }))
    .sort((a, b) => b.disagreement - a.disagreement || b.coders - a.coders);
}

/** One unit's live answers, with the unit versions its coders saw; null for a unit not in this study. */
export async function resultUnit(db: Db, studyId: number, unitId: number): Promise<ResultsUnit | null> {
  const [unit] = await db
    .select({ externalId: units.externalId })
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.studyId, studyId)));
  if (!unit) return null;
  const answers = await rows<ResultsUnit["answers"][number]>(
    db,
    sql`SELECT a.session_id AS "sessionId", s.coder, a.variable, a.value, a.unit_version_id AS "unitVersionId"
        FROM annotation_values a JOIN coder_sessions s ON s.id = a.session_id
        WHERE ${live(studyId)} AND a.unit_id = ${unitId}
        ORDER BY a.session_id, a.variable`,
  );
  const versionIds = [...new Set(answers.flatMap((a) => (a.unitVersionId === null ? [] : [a.unitVersionId])))];
  const versions =
    versionIds.length === 0
      ? []
      : await rows<{ id: number; data: Record<string, unknown> }>(
          db,
          sql`SELECT id, ${unitVersionData(sql`unit_versions.id`)} AS data FROM unit_versions
              WHERE study_id = ${studyId} AND id IN (${sql.join(
                versionIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
        );
  return { unitId, externalId: unit.externalId, versions, answers };
}
