import { beforeEach, describe, expect, it } from "vitest";
import { AnnotationPageSchema, CoderProgressSchema, ExampleSummarySchema, JobResponseSchema, type AnnotationRow } from "@annotinder/contracts";
import type { Sql } from "../db.js";
import { createApp } from "../app.js";
import { createApiKey, ensureUser } from "../shared/accounts.js";
import { listExamples } from "../examples.js";
import { emptyDb } from "./testDb.js";

// Example jobs (docs/plans/examples.md): every example makes a working job,
// with valid example answers, that a coder can start coding.

let db: Sql;
let app: ReturnType<typeof createApp>;
let key: string;

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db);
  const user = await ensureUser(db, "r@uni.nl");
  await db.query("UPDATE users SET role = 'researcher' WHERE id = $1", [user.id]);
  key = (await createApiKey(db, user.id, "test")).key;
});

const researcher = (path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${key}` } });

describe("example jobs", () => {
  it("lists the catalogue", async () => {
    const examples = ExampleSummarySchema.array().parse(await (await researcher("/examples")).json());
    expect(examples.map((e) => e.id).sort()).toEqual(["actor-spans", "simple-experiment", "simple-survey", "survey-annotations", "swipe-sentiment", "tour"]);
  });

  it.each(listExamples().map((e) => e.id))("%s makes a job that can be coded, with its example answers", async (id) => {
    const res = await researcher("/job/from-example", { method: "POST", body: JSON.stringify({ example: id }) });
    expect(res.status).toBe(201);
    const job = JobResponseSchema.parse(await res.json());
    expect(job.origin).toBe(id);

    // The researcher owns it, and it is published with an invitation
    expect((await researcher(`/job/${job.id}`)).status).toBe(200);
    const [invite] = (await (await researcher(`/job/${job.id}/invites`)).json()) as { secret: string }[];
    expect((await (await researcher(`/job/${job.id}/deployment`)).json()) as { active: boolean }).toMatchObject({ active: true });

    // Example answers: every coder's answers are in the download
    const coders = CoderProgressSchema.array().parse(await (await researcher(`/job/${job.id}/coders`)).json());
    const page = AnnotationPageSchema.parse(await (await researcher(`/job/${job.id}/annotations?limit=10000`)).json());
    const answered = new Set(page.annotations.map((a: AnnotationRow) => a.coderId));
    expect(coders.every((c) => answered.has(c.id))).toBe(true);
    // Their finished units count (every question of the loop answered)
    const units = page.annotations.filter((a) => a.unitId !== null).length;
    if (units > 0) expect(coders.some((c) => Object.values(c.finished).some((n) => n > 0))).toBe(true);

    // A coder can start
    const coder = await app.request(`/d/${job.id}/session`, { headers: { "x-annotinder": "1", "x-invite-secret": invite.secret } });
    expect(coder.status).toBe(200);
  });

  it("counts against the researcher's limit on jobs", async () => {
    const plan = await db.query<{ id: number }>("INSERT INTO plans (name, limits) VALUES ('One', '{\"jobs\": 1}') RETURNING id");
    await db.query("UPDATE users SET plan_id = $1", [plan[0].id]);
    expect((await researcher("/job/from-example", { method: "POST", body: JSON.stringify({ example: "nope" }) })).status).toBe(404);
    expect((await researcher("/job/from-example", { method: "POST", body: JSON.stringify({ example: "tour" }) })).status).toBe(201);
    const second = await researcher("/job/from-example", { method: "POST", body: JSON.stringify({ example: "tour" }) });
    expect(await second.json()).toMatchObject({ code: "limit_reached" });
  });
});
