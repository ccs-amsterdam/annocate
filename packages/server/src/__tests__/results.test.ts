import { beforeEach, describe, expect, it } from "vitest";
import {
  CoderUnitsSchema,
  ResultsAgreementSchema,
  ResultsAnswersSchema,
  ResultsCodersSchema,
  ResultsUnitSchema,
  ResultsUnitsSchema,
  StudyResponseSchema,
  type ResultsAgreement,
  type ResultsAnswers,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { emptyDb } from "./testDb.js";
import { sql } from "drizzle-orm";

// The results views (contracts results.ts): counts and agreement, on studies
// made from the examples, whose example coders have answers.

let db: Db;
let app: ReturnType<typeof createApp>;
const headers = { "content-type": "application/json", "x-dev-role": "ADMIN", "x-dev-email": "r@uni.nl" };

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db, { devMode: true });
});

async function example(id: string): Promise<number> {
  const res = await app.request("/api/study/from-example", {
    method: "POST",
    headers,
    body: JSON.stringify({ example: id }),
  });
  expect(res.status).toBe(201);
  return StudyResponseSchema.parse(await res.json()).id;
}

async function get<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  const res = await app.request(`/api${path}`, { headers });
  expect(res.status).toBe(200);
  return schema.parse(await res.json());
}

const answers = (studyId: number): Promise<ResultsAnswers> =>
  get(`/study/${studyId}/results/answers`, ResultsAnswersSchema);
const agreement = (studyId: number): Promise<ResultsAgreement> =>
  get(`/study/${studyId}/results/agreement`, ResultsAgreementSchema);

describe("results", () => {
  it("count the answers per question and value; a scale per item", async () => {
    const survey = await answers(await example("simple-survey"));
    const byName = (q: string, item: string | null = null) =>
      survey.questions.find((x) => x.question === q && x.item === item)!;
    expect(byName("sources")).toMatchObject({ loop: null, type: "nominal", answered: 3 });
    // Several answers: each counts
    expect(byName("sources").counts.reduce((sum, c) => sum + c.count, 0)).toBeGreaterThan(3);
    expect(byName("social_platform")).toMatchObject({ answered: 1, skipped: 2 });
    expect(byName("trust", "tv").counts.reduce((sum, c) => sum + c.count, 0)).toBe(3);

    const swipe = await answers(await example("swipe-sentiment"));
    const [sentiment] = swipe.questions;
    expect(sentiment).toMatchObject({ question: "sentiment", loop: "1", answered: 30 });
    expect(sentiment.counts.reduce((sum, c) => sum + c.count, 0)).toBe(30);
  });

  it("measure agreement on unit-loop questions, with each coder's agreement with the others", async () => {
    const study = await example("swipe-sentiment");
    const [sentiment] = (await agreement(study)).questions;
    expect(sentiment).toMatchObject({ question: "sentiment", metric: "nominal", units: 5 });
    expect(sentiment.alpha).toBeCloseTo(0.611, 3);
    expect(sentiment.coders.map((c) => c.coder)).toEqual(["Example coder 1", "Example coder 2", "Example coder 3"]);
    // Survey questions (outside loops) have none
    expect((await agreement(await example("simple-survey"))).questions).toEqual([]);
  });

  it("measure span agreement per label, over the words of each text", async () => {
    const rows = (await agreement(await example("actor-spans"))).questions;
    expect(rows.map((r) => r.option)).toEqual(["person", "organisation"]);
    expect(rows[0]).toMatchObject({ alpha: 1, percent: 1 });
    // One coder marked a word as an organisation that the other didn't
    expect(rows[1].alpha).toBeGreaterThan(0.5);
    expect(rows[1].alpha).toBeLessThan(1);
    expect(rows[1].units).toBe(rows[0].units);
  });

  it("list units several coders answered, most disagreement first, and show one with every coder's answers", async () => {
    const study = await example("swipe-sentiment");
    const { units } = await get(`/study/${study}/results/units`, ResultsUnitsSchema);
    expect(units).toHaveLength(5);
    expect(units.every((u) => u.coders === 3 && u.loop === "1")).toBe(true);
    const sorted = [...units].sort((a, b) => b.disagreement - a.disagreement);
    expect(units.map((u) => u.disagreement)).toEqual(sorted.map((u) => u.disagreement));
    // Three coders: all the same (0), two of three alike (2/3 of pairs differ), or all different (1)
    for (const u of units) expect([0, 2 / 3, 1].some((d) => Math.abs(d - u.disagreement) < 1e-9)).toBe(true);

    const unit = await get(`/study/${study}/results/units/${units[0].unitId}`, ResultsUnitSchema);
    expect(unit.externalId).toBe(units[0].externalId);
    expect(unit.answers.map((a) => a.coder).sort()).toEqual(["Example coder 1", "Example coder 2", "Example coder 3"]);
    expect(unit.versions).toHaveLength(1);
    expect(unit.versions[0].data).toHaveProperty("headline");
    const other = await example("actor-spans");
    expect((await app.request(`/api/study/${other}/results/units/${units[0].unitId}`, { headers })).status).toBe(404);
  });

  it("per coder: units, median time per unit, practice tries", async () => {
    const { coders } = await get(`/study/${await example("swipe-sentiment")}/results/coders`, ResultsCodersSchema);
    expect(coders.map((c) => c.units)).toEqual([10, 10, 10]);
    for (const c of coders) expect(c.medianUnitSeconds === null || c.medianUnitSeconds > 0).toBe(true);
  });

  it("list per coder id the units they answered (kept with them when redistributing) and were only sent", async () => {
    const study = await example("swipe-sentiment");
    const { coders } = await get(`/study/${study}/coders/units`, CoderUnitsSchema);
    expect(coders.map((c) => c.coder)).toEqual(["Example coder 1", "Example coder 2", "Example coder 3"]);
    expect(coders.every((c) => c.coded.length === 10 && c.served.length === 0)).toBe(true);
  });

  it("answer a repeated request with 304 while the study is unchanged", async () => {
    const study = await example("swipe-sentiment");
    const first = await app.request(`/api/study/${study}/results/answers`, { headers });
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"answers-[0-9a-f]+"$/);
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    const again = await app.request(`/api/study/${study}/results/answers`, {
      headers: { ...headers, "if-none-match": `W/${etag}` },
    });
    expect(again.status).toBe(304);
    // Another view has its own tag
    const agreement = await app.request(`/api/study/${study}/results/agreement`, {
      headers: { ...headers, "if-none-match": etag },
    });
    expect(agreement.status).toBe(200);
  });

  it("leave out answers a researcher reset", async () => {
    const study = await example("swipe-sentiment");
    await db.execute(sql`UPDATE annotation_values SET retired_at = now() WHERE study_id = ${study}`);
    expect((await answers(study)).questions[0].answered).toBe(0);
    expect((await agreement(study)).questions[0]).toMatchObject({ alpha: null, units: 0 });
  });
});
