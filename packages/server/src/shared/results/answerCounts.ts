import { sql } from "drizzle-orm";
import type { QuestionAnswers } from "@annotinder/contracts";
import { rows, type Db } from "../../db/index.js";
import { deployedQuestions, live, notSkipped, type Value } from "./liveAnswers.js";

/** Per question (and scale item) of the deployed design: how many answered, skipped, and each value's count. */
export async function answerCounts(db: Db, studyId: number): Promise<QuestionAnswers[]> {
  const questions = await deployedQuestions(db, studyId);
  const totals = await rows<{ variable: string; answered: number; skipped: number }>(
    db,
    sql`SELECT variable, count(*) FILTER (WHERE ${notSkipped})::int AS answered,
          count(*) FILTER (WHERE NOT (${notSkipped}))::int AS skipped
        FROM annotation_values a WHERE ${live(studyId)} GROUP BY variable`,
  );
  // Values (with a scale's item), span labels and relation labels, counted; a
  // special answer without a code by its kind (`dont_know`)
  const counted = await rows<{ variable: string; item: string | null; value: Value; count: number }>(
    db,
    sql`SELECT variable, item, value, count(*)::int AS count FROM (
          SELECT a.variable, v->>'item' AS item, COALESCE(v->'value', v->'special') AS value
            FROM annotation_values a, jsonb_array_elements(COALESCE(a.value->'values', '[]')) v
            WHERE ${live(studyId)} AND ${notSkipped}
          UNION ALL
          SELECT a.variable, NULL, s->'value'
            FROM annotation_values a,
              jsonb_array_elements(COALESCE(a.value->'spans', '[]') || COALESCE(a.value->'relations', '[]')) s
            WHERE ${live(studyId)} AND ${notSkipped}
        ) answers GROUP BY variable, item, value ORDER BY count DESC`,
  );
  const total = new Map(totals.map((t) => [t.variable, t]));
  return questions.flatMap(({ name, type, loop }) => {
    const items = type.type === "scale" ? type.items.map((i) => i.name) : [null];
    return items.map((item) => {
      // Open answers: no counts per value (nearly every one differs; the download has them)
      const counts =
        type.type === "text"
          ? []
          : counted.filter((c) => c.variable === name && c.item === item).map(({ value, count }) => ({ value, count }));
      const row = total.get(name);
      // A scale's item: the answers that rate it
      const answered = item === null ? (row?.answered ?? 0) : counts.reduce((sum, c) => sum + c.count, 0);
      return { question: name, item, loop, type: type.type, answered, skipped: row?.skipped ?? 0, counts };
    });
  });
}
