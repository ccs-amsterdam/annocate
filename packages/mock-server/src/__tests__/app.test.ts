import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createDb } from "../db/schema.js";
import { createApp } from "../app.js";

let db: DatabaseSync;
let app: ReturnType<typeof createApp>;

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return res.json() as Promise<{ id: number }>;
}

describe("job routes", () => {
  it("creates and fetches a job", async () => {
    const job = await createJob("My job");
    const res = await app.request(`/job/${job.id}`, { headers: adminHeaders });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.name).toBe("My job");
  });

  it("rejects creating a second job", async () => {
    await createJob();
    const res = await app.request("/job", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Second" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects job access without a role header", async () => {
    const job = await createJob();
    const res = await app.request(`/job/${job.id}`);
    expect(res.status).toBe(401);
  });
});

describe("codebook routes", () => {
  it("rejects invalid nesting and accepts a valid codebook", async () => {
    await createJob();

    const validItems = [
      { type: "unit_loop", position: "1", name: "loop", unitset: "main", layout: { fields: [] } },
      {
        type: "unit_variable",
        position: "1.1",
        name: "q1",
        variable: { type: "confirm", question: "Confirm?" },
      },
    ];

    const badRes = await app.request("/codebook", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Bad",
        items: [{ type: "unit_variable", position: "1", name: "q1", variable: { type: "confirm", question: "?" } }],
      }),
    });
    expect(badRes.status).toBe(400);

    const goodRes = await app.request("/codebook", {
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
    await createJob();
    await app.request("/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "u1", data: { text: "hello" } }] }),
    });
    const unitsRes = await app.request("/units", { headers: adminHeaders });
    const units = (await unitsRes.json()) as { id: number }[];

    await app.request("/unitsets", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "main", unitIds: [units[0].id], order: "fixed" }),
    });

    await app.request("/codebook", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "cb",
        items: [
          { type: "unit_loop", position: "1", name: "loop", unitset: "main", layout: { fields: [] } },
          {
            type: "unit_variable",
            position: "1.1",
            name: "q1",
            variable: { type: "confirm", question: "Confirm?" },
          },
        ],
      }),
    });

    const inviteRes = await app.request("/coders/invite", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ label: "invite", access: "user_decides" }),
    });
    const invite = (await inviteRes.json()) as { secret: string };
    return { unitId: units[0].id, secret: invite.secret };
  }

  it("lets a coder start a session, fetch the next unit, submit variables, and see progress", async () => {
    const { unitId, secret } = await setupJobWithCodebookAndUnits();
    const coderHeaders = { "content-type": "application/json", "x-coder-key": "coder-abc", "x-invite-secret": secret };

    const sessionRes = await app.request("/session", { headers: coderHeaders });
    expect(sessionRes.status).toBe(200);
    const session = await json(sessionRes);
    expect(session.codebook.name).toBe("cb");
    expect(session.progress).toEqual([]);

    const nextRes = await app.request("/unitset/main/next", { headers: coderHeaders });
    expect(nextRes.status).toBe(200);
    const nextUnit = await json(nextRes);
    expect(nextUnit.id).toBe(unitId);

    const submitRes = await app.request("/variables/unit", {
      method: "POST",
      headers: coderHeaders,
      body: JSON.stringify({ unitId, variables: { q1: { done: true, skip: false } } }),
    });
    expect(submitRes.status).toBe(204);

    const afterRes = await app.request("/unitset/main/next", { headers: coderHeaders });
    expect(await afterRes.json()).toBeNull();

    const sessionAfter = await json(await app.request("/session", { headers: coderHeaders }));
    expect(sessionAfter.progress).toEqual([{ unitset: "main", doneUnitIds: [unitId] }]);
  });

  it("rejects an unknown coder key without an invite secret", async () => {
    await setupJobWithCodebookAndUnits();
    const res = await app.request("/session", { headers: { "x-coder-key": "unknown" } });
    expect(res.status).toBe(401);
  });
});
