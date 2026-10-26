import { beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "../db.js";
import { emptyDb } from "./testDb.js";
import { createApp } from "../app.js";
import { DbStore } from "../runtime/store.js";
import { HttpError } from "../shared/http.js";
import type { CodebookItem, VariableValue } from "@annotinder/contracts";

let db: Sql;
let app: ReturnType<typeof createApp>;

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: bodies are inspected loosely
async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(async () => {
  db = await emptyDb();
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

describe("units: fields and pages", () => {
  async function upload(jobId: number, units: object[], overwrite = false) {
    return app.request(`/job/${jobId}/units`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units, overwrite }),
    });
  }

  it("takes the fields from the first upload and checks later ones against them", async () => {
    const job = await createJob();
    expect((await upload(job.id, [{ externalId: "u1", data: { n: 1, t: "a" } }])).status).toBe(201);
    const fields = await json(await app.request(`/job/${job.id}/units/fields`, { headers: adminHeaders }));
    expect(fields).toEqual([
      { name: "n", type: "number" },
      { name: "t", type: "text" },
    ]);

    // wrong type, missing or unknown field: nothing is stored
    const bad = await upload(job.id, [
      { externalId: "u2", data: { n: 2, t: "b" } },
      { externalId: "u3", data: { n: "3", t: "c" } },
    ]);
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toMatch(/u3.*'n' is number/);
    expect((await upload(job.id, [{ externalId: "u2", data: { n: 2 } }])).status).toBe(400);
    expect((await upload(job.id, [{ externalId: "u2", data: { n: 2, t: "b", x: 1 } }])).status).toBe(400);
    expect(await json(await app.request(`/job/${job.id}/units`, { headers: adminHeaders }))).toHaveLength(1);

    // empty values fit any type
    expect((await upload(job.id, [{ externalId: "u2", data: { n: null, t: "b" } }])).status).toBe(201);
  });

  it("resets the fields when all units are deleted", async () => {
    const job = await createJob();
    const [unit] = await json(await upload(job.id, [{ externalId: "u1", data: { n: 1 } }]));
    await app.request(`/job/${job.id}/units/${unit.id}`, { method: "DELETE", headers: adminHeaders });
    expect((await upload(job.id, [{ externalId: "u1", data: { other: "x" } }])).status).toBe(201);
  });

  it("pages units, or a unitset's units in its order", async () => {
    const job = await createJob();
    const units = (await json(
      await upload(job.id, Array.from({ length: 5 }, (_, i) => ({ externalId: `u${i}`, data: { i } }))),
    )) as { id: number }[];
    await app.request(`/job/${job.id}/unitsets`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "set", unitIds: [units[4].id, units[0].id, units[2].id] }),
    });
    const page = async (query: string) =>
      json(await app.request(`/job/${job.id}/units/page?${query}`, { headers: adminHeaders }));

    const all = await page("offset=1&limit=2");
    expect(all.total).toBe(5);
    expect(all.units.map((u: { externalId: string }) => u.externalId)).toEqual(["u1", "u2"]);
    const set = await page("unitset=set&offset=1&limit=5");
    expect(set.total).toBe(3);
    expect(set.units.map((u: { externalId: string }) => u.externalId)).toEqual(["u0", "u2"]);
  });
});

/** The status a store call would answer with: 200, or its HttpError's. */
async function status(call: Promise<unknown>): Promise<number> {
  try {
    await call;
    return 200;
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
}

describe("annotations: finished counts and resets", () => {
  const value = (code: string): VariableValue => ({ done: true, skip: false, codes: [{ code }] });

  async function setup() {
    const job = await createJob();
    const store = new DbStore(db, job.id);
    const units = (await json(
      await app.request(`/job/${job.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ units: [{ externalId: "u1", data: {} }, { externalId: "u2", data: {} }] }),
      }),
    )) as { id: number }[];
    const invite = await json(
      await app.request(`/job/${job.id}/invites`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ label: "x" }) }),
    );
    const coder = await store.resolveCoder({ coderKey: "k", inviteSecret: invite.secret });
    const put = (unitId: number, variables: Record<string, VariableValue>) =>
      store.putAnnotation({ unitId, coderId: coder.coderId, variables });
    const finished = (variables: string[], values?: string[]) => store.listFinished({ loops: [{ loop: "l", variables, values }] });
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
    const rows = await db.query<{ variable: string; value: VariableValue }>(
      "SELECT variable, value FROM annotation_values WHERE retired_at IS NULL ORDER BY variable",
    );
    expect(rows.map((r) => [r.variable, r.value.codes?.[0].code])).toEqual([
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
    expect(await db.query("SELECT COUNT(*)::int AS n FROM annotation_values WHERE unit_id = $1", [units[0].id])).toEqual([{ n: 2 }]);
    expect(await finished(["q1"])).toHaveLength(2);
  });
});

describe("invites, coder progress and overview", () => {
  const value = (code: string): VariableValue => ({ done: true, skip: false, codes: [{ code }] });

  async function setup() {
    const job = await createJob();
    const store = new DbStore(db, job.id);
    const units = (await json(
      await app.request(`/job/${job.id}/units`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ units: [{ externalId: "u1", data: {} }, { externalId: "u2", data: {} }] }),
      }),
    )) as { id: number }[];
    const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });
    const codebook = await json(
      await app.request(`/job/${job.id}/codebook`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          items: [
            {
              type: "unit_loop",
              name: "l",
              units: [{ sources: [{ unitset: "main" }] }],
              layout: { template: "" },
              children: [question("q1"), question("q2")],
            },
          ],
        }),
      }),
    );
    await app.request(`/job/${job.id}/deployment`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ codebookId: codebook.id }),
    });
    const createInvite = async (label: string) =>
      json(await app.request(`/job/${job.id}/invites`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ label }) }));
    const resolve = (coderKey: string, inviteSecret: string) => store.resolveCoder({ coderKey, inviteSecret });
    const put = (coderId: number, unitId: number, variables: Record<string, VariableValue>) =>
      store.putAnnotation({ unitId, coderId, variables });
    const get = async (path: string) => json(await app.request(`/job/${job.id}${path}`, { headers: adminHeaders }));
    return { job, units, createInvite, resolve, put, get };
  }

  it("lists invites; revoked invites take no new coders, used ones can't be deleted", async () => {
    const { job, createInvite, resolve, get } = await setup();
    const used = await createInvite("used");
    const unused = await createInvite("unused");
    expect(await status(resolve("a", used.secret))).toBe(200);

    const invites = await get("/invites");
    expect(invites.map((i: { label: string; uses: number }) => [i.label, i.uses])).toEqual([
      ["used", 1],
      ["unused", 0],
    ]);

    const del = (id: number) => app.request(`/job/${job.id}/invites/${id}`, { method: "DELETE", headers: adminHeaders });
    expect((await del(used.id)).status).toBe(409);
    expect((await del(unused.id)).status).toBe(204);

    const revoked = await json(
      await app.request(`/job/${job.id}/invites/${used.id}/revoke`, { method: "POST", headers: adminHeaders }),
    );
    expect(revoked.revokedAt).not.toBeNull();
    expect(await status(resolve("b", used.secret))).toBe(401);
    // coders who already started keep their access
    expect(await status(resolve("a", used.secret))).toBe(200);
  });

  it("reports coder progress and the overview from live answers", async () => {
    const { units, createInvite, resolve, put, get } = await setup();
    const invite = await createInvite("batch 1");
    const coderA = await resolve("a", invite.secret);
    await resolve("b", invite.secret);
    await put(coderA.coderId, units[0].id, { q1: value("x"), q2: value("y") });
    await put(coderA.coderId, units[1].id, { q1: value("x") });

    const coders = await get("/coders");
    expect(coders[0]).toMatchObject({ inviteLabel: "batch 1", answers: 3, finished: { l: 1 } });
    expect(coders[0].lastActive).not.toBeNull();
    expect(coders[1]).toMatchObject({ answers: 0, lastActive: null, finished: { l: 0 } });

    const overview = await get("/overview");
    expect(overview).toMatchObject({
      units: 2,
      coders: { total: 2, started: 1, activeLastDay: 1 },
      answers: 3,
      codings: 1,
    });
    expect(overview.activity).toHaveLength(30);
    expect(overview.activity.at(-1)).toEqual({ day: new Date().toISOString().slice(0, 10), answers: 3, coders: 1 });
  });
});
