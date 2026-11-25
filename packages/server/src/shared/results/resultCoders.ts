import { sql } from "drizzle-orm";
import type { ResultCoder } from "@annotinder/contracts";
import { rows, type Db } from "../../db/index.js";
import { live } from "./liveAnswers.js";

/** Per coder session with unit answers: units, median time per unit, practice tries. */
export async function resultCoders(db: Db, studyId: number): Promise<ResultCoder[]> {
  return rows<ResultCoder>(
    db,
    sql`SELECT u.session_id AS "sessionId", s.coder, count(*)::int AS units,
          (percentile_cont(0.5) WITHIN GROUP (ORDER BY u.ms) FILTER (WHERE u.ms IS NOT NULL) / 1000)::float8
            AS "medianUnitSeconds",
          (sum(u.tries) / NULLIF(sum(u.practice), 0))::float8 AS "practiceTries"
        FROM (
          SELECT a.session_id, a.unit_id,
            sum((a.timing->>'totalMs')::numeric) AS ms,
            sum((a.timing->>'tries')::numeric) AS tries,
            count(a.timing->'tries') AS practice
          FROM annotation_values a
          WHERE ${live(studyId)} AND a.unit_id IS NOT NULL
          GROUP BY a.session_id, a.unit_id
        ) u JOIN coder_sessions s ON s.id = u.session_id
        GROUP BY u.session_id, s.coder
        ORDER BY u.session_id`,
  );
}
