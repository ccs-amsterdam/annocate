import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import { emptyDb, query } from "./testDb.js";
import { createApp } from "../app.js";

let db: Db;
let app: ReturnType<typeof createApp>;

const headers = { "content-type": "application/json", "x-dev-role": "ADMIN" };

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db, { devMode: true });
});

afterEach(() => vi.restoreAllMocks());

const send = (method: string, path: string, body?: string) => app.request(`/api${path}`, { method, headers, body });

async function createStudy(): Promise<number> {
  const res = await send("POST", "/study", JSON.stringify({ name: "Study" }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

describe("bad input is a 400, never a 500", () => {
  it("malformed JSON in a body", async () => {
    const studyId = await createStudy();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const requests: [string, string][] = [
      ["POST", "/study"],
      ["PUT", `/study/${studyId}`],
      ["POST", `/study/${studyId}/design`],
      ["POST", `/study/${studyId}/units`],
      ["PUT", `/study/${studyId}/users`],
      ["PUT", `/study/${studyId}/deployment`],
      ["POST", "/admin/plans"],
    ];
    for (const [method, path] of requests) {
      const res = await send(method, path, "{not json");
      expect([path, res.status]).toEqual([path, 400]);
      expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it("a body or query the schema refuses: one shape everywhere, a message with the issues", async () => {
    const study = await send("POST", "/study", JSON.stringify({ name: 3 }));
    expect(study.status).toBe(400);
    expect(await study.json()).toEqual({
      error: "Invalid request body",
      issues: [{ path: "name", message: expect.any(String) as string }],
    });
    const plan = await send("POST", "/admin/plans", JSON.stringify({ name: 3, limits: {} }));
    expect(plan.status).toBe(400);
    expect(await plan.json()).toMatchObject({ error: "Invalid request body", issues: [{ path: "name" }] });
    const studyId = await createStudy();
    const query = await send("GET", `/study/${studyId}/annotations?limit=many`);
    expect(query.status).toBe(400);
    expect(await query.json()).toMatchObject({ error: "Invalid query parameters", issues: [{ path: "limit" }] });
  });

  it("an id in the path that is not a positive integer in range", async () => {
    const studyId = await createStudy();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const paths: [string, string][] = [
      ["GET", `/study/${studyId}/design/abc`],
      ["DELETE", `/study/${studyId}/design/1.5`],
      ["GET", `/study/${studyId}/units/abc`],
      ["DELETE", `/study/${studyId}/units/-1`],
      ["GET", `/study/${studyId}/results/units/abc`],
      ["POST", `/study/${studyId}/links/abc/revoke`],
      ["POST", `/study/${studyId}/links/99999999999999999999/reopen`],
      ["GET", "/study/99999999999"],
      ["POST", `/study/${studyId}/sessions/abc/deletion-request/postpone`],
      ["DELETE", "/admin/plans/abc"],
      ["DELETE", "/admin/users/0"],
      ["GET", "/study/abc"],
    ];
    for (const [method, path] of paths) {
      const res = await send(method, path);
      expect([path, res.status]).toEqual([path, 400]);
      expect(typeof ((await res.json()) as { error: unknown }).error).toBe("string");
    }
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("database errors", () => {
  it("a unique constraint is a 409", async () => {
    const plan = JSON.stringify({ name: "Twice", limits: {} });
    expect((await send("POST", "/admin/plans", plan)).status).toBe(201);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const again = await send("POST", "/admin/plans", plan);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "Already exists" });
    expect(errors).not.toHaveBeenCalled();
  });

  it("a failed query is logged with its text and the database's message, never its parameters", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await query(db, "ALTER TABLE plans RENAME TO plans_away");
    try {
      const res = await send("POST", "/admin/plans", JSON.stringify({ name: "a-secret-value", limits: {} }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Internal error", requestId: res.headers.get("x-request-id") });
    } finally {
      await query(db, "ALTER TABLE plans_away RENAME TO plans");
    }
    const logged = errors.mock.calls.flat().map(printed).join("\n");
    expect(logged).toContain('insert into "plans"');
    expect(logged).toContain('relation "plans" does not exist');
    expect(logged).not.toContain("a-secret-value");
  });
});

/** What `console.error` prints of a value: an error with its message, stack, causes and own fields. */
function printed(value: unknown): string {
  return typeof value === "string" ? value : inspect(value, { depth: 8 });
}
