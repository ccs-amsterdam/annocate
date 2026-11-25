import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { rows } from "../db/index.js";
import { coderStudiesQuery } from "../shared/coderStudies.js";
import { emptyDb } from "./testDb.js";

// The coder home's query plan, which only a real Postgres gives: run with
// TEST_DATABASE_URL, a scratch server (`pnpm test:pg`). Skipped without it.

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Index Cond"?: string;
  Plans?: PlanNode[];
}

const nodes = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(nodes)];

/** 100,000 answers: 20 studies of 100 sessions, 50 units each. Only these rows: nothing they refer to is there. */
const MANY_ANSWERS = sql`
  INSERT INTO annotation_values
    (study_id, session_id, unit_id, unit_version_id, design_version_id, variable, value, created, updated)
  SELECT session % 20 + 1, session, unit, unit, 1, 'v', '1', now(), now()
  FROM generate_series(1, 2000) session, generate_series(1, 50) unit`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("the coder home", () => {
  it("finds each session's answers by the index on study and session", async () => {
    const db = await emptyDb();
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      await tx.execute(MANY_ANSWERS);
      await tx.execute(sql`ANALYZE annotation_values`);
      const [row] = await rows<{ "QUERY PLAN": [{ Plan: PlanNode }] }>(
        tx,
        sql`EXPLAIN (FORMAT JSON) ${coderStudiesQuery(tx, undefined)}`,
      );
      return nodes(row!["QUERY PLAN"][0].Plan);
    });
    const answers = plan.filter((n) => (n["Index Name"] ?? n["Relation Name"])?.startsWith("annotation_values"));
    const scans = answers.filter((n) => n["Index Name"] !== undefined);
    // Both subqueries (the last answer's is there twice: selected and sorted by)
    expect(scans).toHaveLength(3);
    expect(answers.map((n) => n["Node Type"])).not.toContain("Seq Scan");
    for (const scan of scans) {
      expect(scan["Index Name"]).toBe("annotation_values_coder");
      expect(scan["Index Cond"]).toMatch(/study_id = .*session_id = /);
    }
  });
});
