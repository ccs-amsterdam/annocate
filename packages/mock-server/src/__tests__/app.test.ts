import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createDb } from "../db/schema.js";
import { createApp } from "../app.js";
import type { CodebookItem } from "@annotinder/contracts";

let db: DatabaseSync;
let app: ReturnType<typeof createApp>;

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(() => {
  db = createDb(":memory:");
  app = createApp(db);
});

async function createJob(name = "Test job") {
  const res = await app.request("/job", { method: "POST", headers: adminHeaders, body: JSON.stringify({ name }) });
  expect(res.status).toBe(201);
  return res.json() as Promise<{ id: number; name: string }>;
}

describe("job routes", () => {
  it("creates and fetches a job", async () => {
    const job = await createJob("My job");
    const res = await app.request(`/job/${job.id}`, { headers: adminHeaders });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.name).toBe("My job");
  });

  it("allows creating multiple jobs and lists them", async () => {
    const job1 = await createJob("First");
    const job2 = await createJob("Second");
    const res = await app.request("/job", { headers: adminHeaders });
    expect(res.status).toBe(200);
    const jobs = (await json(res)) as { id: number; name: string }[];
    expect(jobs.map((j) => j.id).sort()).toEqual([job1.id, job2.id].sort());
  });

  it("rejects job access without a role header", async () => {
    const job = await createJob();
    const res = await app.request(`/job/${job.id}`);
    expect(res.status).toBe(401);
  });
});

describe("codebook routes", () => {
  it("rejects invalid nesting and accepts a valid codebook", async () => {
    const job = await createJob();

    const validItems: CodebookItem[] = [
      {
        type: "unit_loop",
        name: "loop",
        units: [{ sources: [{ unitset: "main" }] }],
        layout: { template: "" },
        children: [
          {
            type: "unit_variable",
            name: "q1",
            variable: { type: "confirm", question: "Confirm?" },
          },
        ],
      },
    ];

    const badRes = await app.request(`/job/${job.id}/codebook`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Bad",
        items: [{ type: "unit_variable", name: "q1", variable: { type: "confirm", question: "?" } }],
      }),
    });
    expect(badRes.status).toBe(400);

    const goodRes = await app.request(`/job/${job.id}/codebook`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Good", items: validItems }),
    });
    expect(goodRes.status).toBe(201);
    const codebook = await json(goodRes);
    expect(codebook.immutable).toBe(false);
  });
});

describe("coder session flow", () => {
  async function setupJobWithCodebookAndUnits() {
    const job = await createJob();
    await app.request(`/job/${job.id}/units`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "u1", data: { text: "hello" } }] }),
    });
    const unitsRes = await app.request(`/job/${job.id}/units`, { headers: adminHeaders });
    const units = (await unitsRes.json()) as { id: number }[];

    await app.request(`/job/${job.id}/unitsets`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "main", unitIds: [units[0].id] }),
    });

    await app.request(`/job/${job.id}/codebook`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "cb",
        items: [
          {
            type: "unit_loop",
            name: "loop",
            unitset: "main",
            layout: { template: "" },
            children: [
              {
                type: "unit_variable",
                name: "q1",
                variable: { type: "confirm", question: "Confirm?" },
              },
            ],
          },
        ],
      }),
    });

    const inviteRes = await app.request(`/job/${job.id}/coders/invite`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ label: "invite", auth: "none" }),
    });
    const invite = (await inviteRes.json()) as { secret: string };
    return { unitId: units[0].id, secret: invite.secret, jobId: job.id };
  }

  it("lets a coder start a session, fetch the next unit, submit variables, and see progress", async () => {
    const { unitId, secret } = await setupJobWithCodebookAndUnits();
    const coderHeaders = { "content-type": "application/json", "x-coder-key": "coder-abc", "x-invite-secret": secret };

    const sessionRes = await app.request("/session", { headers: coderHeaders });
    expect(sessionRes.status).toBe(200);
    const session = await json(sessionRes);
    expect(session.codebook.name).toBe("cb");
    expect(session.progress).toEqual([{ unitset: "loop", doneUnitIds: [], totalUnits: 1 }]);

    const nextRes = await app.request("/loop/loop/next", { headers: coderHeaders });
    expect(nextRes.status).toBe(200);
    const nextUnit = await json(nextRes);
    expect(nextUnit.id).toBe(unitId);

    const submitRes = await app.request("/variables/unit", {
      method: "POST",
      headers: coderHeaders,
      body: JSON.stringify({ unitId, variables: { q1: { done: true, skip: false } } }),
    });
    expect(submitRes.status).toBe(204);

    const afterRes = await app.request("/loop/loop/next", { headers: coderHeaders });
    expect(await afterRes.json()).toBeNull();

    const sessionAfter = await json(await app.request("/session", { headers: coderHeaders }));
    expect(sessionAfter.progress).toEqual([{ unitset: "loop", doneUnitIds: [unitId], totalUnits: 1 }]);
  });

  it("supports unit_loop without unitset defaulting to iterating all units", async () => {
    const job = await createJob();
    await app.request(`/job/${job.id}/units`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        units: [
          { externalId: "u1", data: { text: "hello" } },
          { externalId: "u2", data: { text: "world" } },
        ],
      }),
    });

    // Codebook with unit_loop with no unitset specified!
    await app.request(`/job/${job.id}/codebook`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "all_units_cb",
        items: [
          {
            type: "unit_loop",
            name: "loop",
            layout: { template: "" },
            children: [
              {
                type: "unit_variable",
                name: "q1",
                variable: { type: "confirm", question: "Confirm?" },
              },
            ],
          },
        ],
      }),
    });

    const inviteRes = await app.request(`/job/${job.id}/coders/invite`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ label: "invite", auth: "none" }),
    });
    const invite = (await inviteRes.json()) as { secret: string };
    const coderHeaders = { "content-type": "application/json", "x-coder-key": "coder-xyz", "x-invite-secret": invite.secret };

    // Fetch next unit using __all__
    const nextRes1 = await app.request("/loop/loop/next", { headers: coderHeaders });
    expect(nextRes1.status).toBe(200);
    const unit1 = await json(nextRes1);
    expect(unit1.externalId).toBe("u1");

    await app.request("/variables/unit", {
      method: "POST",
      headers: coderHeaders,
      body: JSON.stringify({ unitId: unit1.id, variables: { q1: { done: true, skip: false } } }),
    });

    // Fetch second unit
    const nextRes2 = await app.request("/loop/loop/next", { headers: coderHeaders });
    expect(nextRes2.status).toBe(200);
    const unit2 = await json(nextRes2);
    expect(unit2.externalId).toBe("u2");
  });

  it("copies an invite's preset variables to new coders and enforces maxUses", async () => {
    const { jobId } = await setupJobWithCodebookAndUnits();
    const inviteRes = await app.request(`/job/${jobId}/coders/invite`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ label: "alice", auth: "none", maxUses: 1, variables: { slot: "2" } }),
    });
    const invite = await json(inviteRes);
    expect(invite).toMatchObject({ uses: 0, maxUses: 1, variables: { slot: "2" } });

    const headers = (key: string) => ({ "x-coder-key": key, "x-invite-secret": invite.secret });
    const session = await json(await app.request("/session", { headers: headers("alice") }));
    expect(session.variables.slot.codes).toEqual([{ code: "2" }]);
    expect((await app.request("/session", { headers: headers("bob") })).status).toBe(401);
  });

  it("rejects an unknown coder key without an invite secret", async () => {
    await setupJobWithCodebookAndUnits();
    const res = await app.request("/session", { headers: { "x-coder-key": "unknown" } });
    expect(res.status).toBe(401);
  });
});

describe("unitset generation", () => {
  it("splits units into parts plus an overlap set", async () => {
    const job = await createJob();
    await app.request(`/job/${job.id}/units`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: Array.from({ length: 10 }, (_, i) => ({ externalId: `u${i}`, data: { i } })) }),
    });
    const generate = (body: object) =>
      app.request(`/job/${job.id}/unitsets/generate`, { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });

    const res = await generate({ prefix: "part", parts: 4, overlapUnits: 2 });
    expect(res.status).toBe(201);
    const sets = (await json(res)) as { name: string; unitIds: number[] }[];
    expect(sets.map((s) => [s.name, s.unitIds.length])).toEqual([
      ["part_1", 2],
      ["part_2", 2],
      ["part_3", 2],
      ["part_4", 2],
      ["part_overlap", 2],
    ]);
    expect(new Set(sets.flatMap((s) => s.unitIds)).size).toBe(10);

    expect((await generate({ prefix: "part", parts: 2 })).status).toBe(409);
  });
});

describe("schema migrations", () => {
  it("splits pre-2026-10-16 per-unit annotation blobs into per-variable rows", () => {
    const path = join(mkdtempSync(join(tmpdir(), "annotinder-")), "db.sqlite");
    const old = createDb(path);
    old.exec(`CREATE TABLE annotations (jobId INTEGER, unitId INTEGER, coderId INTEGER, variables TEXT,
      updated TEXT, codebookId INTEGER, done INTEGER, doneAt TEXT, PRIMARY KEY (unitId, coderId))`);
    old
      .prepare("INSERT INTO annotations VALUES (1, 7, 1, ?, '2026-01-02T00:00:00.000Z', 3, 1, '2026-01-01T00:00:00.000Z')")
      .run(JSON.stringify({ a: { done: true, codes: [{ code: "x" }] }, b: { done: true, skip: true } }));
    old.close();

    const db = createDb(path);
    const rows = db.prepare("SELECT unitId, variable, value, codebookId, created, retiredAt FROM annotation_values ORDER BY variable").all();
    expect(rows).toEqual([
      { unitId: 7, variable: "a", value: JSON.stringify({ done: true, codes: [{ code: "x" }] }), codebookId: 3, created: "2026-01-01T00:00:00.000Z", retiredAt: null },
      { unitId: 7, variable: "b", value: JSON.stringify({ done: true, skip: true }), codebookId: 3, created: "2026-01-01T00:00:00.000Z", retiredAt: null },
    ]);
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'annotations'").get()).toBeUndefined();
  });
});

describe("annotations: finished counts and resets", () => {
  const backend = { authorization: "Bearer dev-job-server-secret", "content-type": "application/json" };
  const value = (code: string) => ({ done: true, codes: [{ code }] });

  async function setup() {
    const job = await createJob();
    const units = (await json(
      await app.request(`/job/${job.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ units: [{ externalId: "u1", data: {} }, { externalId: "u2", data: {} }] }),
      }),
    )) as { id: number }[];
    const invite = await json(
      await app.request(`/job/${job.id}/coders/invite`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ label: "x" }) }),
    );
    const coder = await json(
      await app.request(`/backend/job/${job.id}/coders/resolve`, {
        method: "POST",
        headers: backend,
        body: JSON.stringify({ coderKey: "k", inviteSecret: invite.secret }),
      }),
    );
    const put = (unitId: number, variables: object) =>
      app.request(`/backend/job/${job.id}/annotations/${unitId}/${coder.coderId}`, {
        method: "PUT",
        headers: backend,
        body: JSON.stringify({ variables }),
      });
    const finished = async (variables: string[], values?: string[]) =>
      (await json(
        await app.request(`/backend/job/${job.id}/finished`, {
          method: "POST",
          headers: backend,
          body: JSON.stringify({ loops: [{ loop: "l", variables, values }] }),
        }),
      )) as { unitId: number; values?: Record<string, unknown> }[];
    return { job, units, coder, put, finished };
  }

  it("counts a unit as finished only when every given variable is live", async () => {
    const { units, put, finished } = await setup();
    await put(units[0].id, { q1: value("a"), q2: value("b") });
    await put(units[1].id, { q1: value("a") });

    expect((await finished(["q1", "q2"])).map((f) => f.unitId)).toEqual([units[0].id]);
    expect((await finished(["q1"])).map((f) => f.unitId)).toEqual([units[0].id, units[1].id]);
    // a question added later: nothing is finished until it is answered
    expect(await finished(["q1", "q2", "q3"])).toEqual([]);
    // values of requested variables come along
    expect((await finished(["q1", "q2"], ["q2"]))[0].values).toMatchObject({ q2: value("b") });
  });

  it("upserts per variable and keeps variables that weren't sent", async () => {
    const { units, put, finished } = await setup();
    await put(units[0].id, { old: value("x"), q1: value("a") });
    await put(units[0].id, { q1: value("b") });
    const rows = db.prepare("SELECT variable, value FROM annotation_values WHERE retiredAt IS NULL ORDER BY variable").all() as {
      variable: string;
      value: string;
    }[];
    expect(rows.map((r) => [r.variable, JSON.parse(r.value).codes[0].code])).toEqual([
      ["old", "x"],
      ["q1", "b"],
    ]);
    expect(await finished(["q1"])).toHaveLength(1);
  });

  it("resets by retiring values: they stay, but no longer count", async () => {
    const { job, units, put, finished } = await setup();
    await app.request(`/job/${job.id}/deployment`, { method: "PUT", headers: adminHeaders, body: JSON.stringify({ codebookId: 1 }) });
    await put(units[0].id, { q1: value("a") });
    await put(units[1].id, { q1: value("a") });

    const res = await app.request(`/job/${job.id}/annotations/reset`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ variables: ["q1"], unitIds: [units[0].id] }),
    });
    expect(await json(res)).toEqual({ retired: 1 });
    expect((await finished(["q1"])).map((f) => f.unitId)).toEqual([units[1].id]);
    // recoded after the reset: a new live row next to the retired one
    await put(units[0].id, { q1: value("b") });
    expect(db.prepare("SELECT COUNT(*) AS n FROM annotation_values WHERE unitId = ?").get(units[0].id)).toEqual({ n: 2 });
    expect(await finished(["q1"])).toHaveLength(2);
  });
});
