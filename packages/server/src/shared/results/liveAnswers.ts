import { sql } from "drizzle-orm";
import { collectQuestions } from "@annotinder/contracts";
import { rows, type Db } from "../../db/index.js";
import { deployedDesignItems } from "../designVersions.js";

// What the results views (contracts results.ts) are made of: the live
// answers, under the deployed design's questions. Counting happens in the
// database; agreement reads one question's values at a time, so memory
// stays small.

export type Value = string | number;

/** The deployed design's questions, with their loop (null outside loops). */
export async function deployedQuestions(db: Db, studyId: number) {
  const items = await deployedDesignItems(db, studyId);
  if (!items) return [];
  const { questions, loopOf } = collectQuestions(items);
  return [...questions].map(([name, type]) => ({ name, type, loop: loopOf.get(name) ?? null }));
}

// Queries name the answers table `a`: `value` alone would also be jsonb_array_elements' column
export const live = (studyId: number) => sql`a.study_id = ${studyId} AND a.retired_at IS NULL`;
export const notSkipped = sql`NOT COALESCE((a.value->>'skip')::boolean, false)`;

/** One question's live answers in units: per unit and session, the answer's values (or spans, with the unit version). */
export async function loopAnswers(db: Db, studyId: number, variable: string, spans: boolean) {
  return rows<{ unit: number; version: number | null; session: number; values: unknown; spans: unknown }>(
    db,
    sql`SELECT unit_id AS unit, unit_version_id AS version, session_id AS session,
          a.value->'values' AS values, ${spans ? sql`a.value->'spans'` : sql`NULL`} AS spans
        FROM annotation_values a
        WHERE ${live(studyId)} AND variable = ${variable} AND unit_id IS NOT NULL AND ${notSkipped}`,
  );
}
