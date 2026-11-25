import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { SessionResponse, VariableValue } from "@annotinder/contracts";
import { createApp } from "../app.js";
import type { Db } from "../db/index.js";
import { DEMO_PUBLIC_ID } from "../db/publicId.js";
import { DbStore } from "../runtime/dbStore.js";
import { MAX_SESSIONS_PER_CODER } from "../runtime/startSession.js";
import { seed } from "../seed.js";
import { emptyDb, query } from "./testDb.js";

// What only a real Postgres shows (PGlite has one connection, so nothing there
// runs at the same time): locks and counters under parallel requests. Run
// with TEST_DATABASE_URL, a scratch server (`pnpm test:pg`). Skipped without it.

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await emptyDb();
  await seed(db);
  app = createApp(db, { secret: "test-secret", devMode: true, runtime: { random: Math.random } });
});

/** Deploys a design of one loop with one question (`sentiment`), with these other items and loop settings. */
async function deploy(invite: object, loopUnits: object = {}, items: object[] = []) {
  const design = {
    session: { invite },
    items: [
      ...items,
      {
        type: "unit_loop",
        id: "loop_1",
        label: "main",
        units: loopUnits,
        children: [
          { type: "layout", template: "" },
          {
            type: "question",
            name: "sentiment",
            variable: { type: "nominal", question: "?", options: [{ value: "positive" }, { value: "negative" }] },
          },
        ],
      },
    ],
  };
  const saved = await app.request("/api/study/1/design", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ note: "concurrency", ...design }),
  });
  expect(saved.status, await saved.clone().text()).toBe(201);
  const { id } = (await saved.json()) as { id: number };
  const deployed = await app.request("/api/study/1/deployment", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ designVersionId: id, units: true }),
  });
  expect(deployed.status, await deployed.clone().text()).toBe(200);
}

/** A request of a browser (its device cookie given) on the demo link. */
const request = (device: string, path: string, init: RequestInit = {}, headers: Record<string, string> = {}) =>
  app.request(`/api/d/${DEMO_PUBLIC_ID}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-annotinder": "1",
      "x-link-secret": "demo-secret",
      cookie: `annotinder_device=${device}`,
      ...headers,
    },
  });

const devices = (n: number) => Array.from({ length: n }, (_, i) => `device-${i + 1}`);
const sessions = () => query<{ id: number; coder: string | null }>(db, "SELECT id, coder FROM coder_sessions");

describe.skipIf(!process.env.TEST_DATABASE_URL)("at the same time", () => {
  it("20 first requests on a link for 5 coders start exactly 5 sessions", async () => {
    await deploy({ mode: "crowd", maxCoders: 5 });
    const statuses = await Promise.all(devices(20).map(async (d) => (await request(d, "/session")).status));
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 403)).toHaveLength(15);
    expect(await sessions()).toHaveLength(5);
    expect(await query(db, "SELECT uses FROM links WHERE secret = 'demo-secret'")).toEqual([{ uses: 5 }]);
  });

  it("the first requests of one device start one session", async () => {
    const ids = await Promise.all(
      Array.from(
        { length: 10 },
        async () => ((await (await request("one", "/session")).json()) as SessionResponse).sessionId,
      ),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await sessions()).toHaveLength(1);
    expect(await query(db, "SELECT uses FROM links WHERE secret = 'demo-secret'")).toEqual([{ uses: 1 }]);
  });

  it("new sessions asked for one coder id stop at the most a coder has", async () => {
    await deploy({ mode: "crowd", coderParam: { param: "PID" } });
    const statuses = await Promise.all(
      devices(12).map(
        async (d) => (await request(d, "/session", {}, { "x-url-params": "PID=p1", "x-new-session": "1" })).status,
      ),
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(MAX_SESSIONS_PER_CODER);
    expect(await sessions()).toHaveLength(MAX_SESSIONS_PER_CODER);
  });

  it("20 balanced draws give each condition 10 coders", async () => {
    const experiment = {
      type: "experiment",
      name: "group",
      variable: { type: "experiment", draw: "balanced", options: [{ value: "a" }, { value: "b" }] },
    };
    await deploy({ mode: "crowd" }, {}, [experiment]);
    const drawn = await Promise.all(
      devices(20).map(async (d) => {
        const res = await request(d, "/experiment/group", { method: "POST" });
        return ((await res.json()) as { value: VariableValue }).value.values?.[0]?.value;
      }),
    );
    expect(drawn.filter((v) => v === "a")).toHaveLength(10);
    expect(drawn.filter((v) => v === "b")).toHaveLength(10);
  });

  it("20 coders on a shared queue of 30 units for 2 coders each: no unit goes to a third", async () => {
    // The demo study's 3 units, and 27 more
    const more = Array.from({ length: 27 }, (_, i) => ({
      externalId: `more-${i + 1}`,
      data: { headline: `Headline ${i + 1}`, text: `Text ${i + 1}` },
    }));
    const upload = await app.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: more }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    await deploy({ mode: "crowd" }, { divide: { codersPerUnit: { min: 2, max: 2 } } });
    // Every coder takes three units, one request after the other; the coders all at once
    const taken = await Promise.all(
      devices(20).map(async (d) => {
        const res = await request(d, "/loop/loop_1/next?count=3");
        expect(res.status).toBe(200);
        return ((await res.json()) as { units: { id: number }[] }).units.map((u) => u.id);
      }),
    );
    const perUnit = new Map<number, number>();
    for (const id of taken.flat()) perUnit.set(id, (perUnit.get(id) ?? 0) + 1);
    expect(taken.flat()).toHaveLength(60);
    expect([...perUnit.values()].every((n) => n === 2)).toBe(true);
    for (const mine of taken) expect(new Set(mine).size).toBe(mine.length);
  });

  it("work under a long lock isn't ended by the database's time limits", async () => {
    const limit = () => (store: object) =>
      (store as { db: Db }).db.execute(sql`SELECT current_setting('statement_timeout') AS value`);
    const store = new DbStore(db, 1);
    const read = async (options?: { long: boolean }) =>
      ((await store.locked("a key", limit(), options)) as unknown as { rows: { value: string }[] }).rows[0]!.value;
    expect(await read()).not.toBe("0");
    expect(await read({ long: true })).toBe("0");
  });
});
