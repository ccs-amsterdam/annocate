import { beforeEach, describe, expect, it } from "vitest";
import {
  ResultsAgreementSchema,
  ResultsAnswersSchema,
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

  it("leave out answers a researcher reset", async () => {
    const study = await example("swipe-sentiment");
    await db.execute(sql`UPDATE annotation_values SET retired_at = now() WHERE study_id = ${study}`);
    expect((await answers(study)).questions[0].answered).toBe(0);
    expect((await agreement(study)).questions[0]).toMatchObject({ alpha: null, units: 0 });
  });
});
