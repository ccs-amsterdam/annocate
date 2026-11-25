import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { firstDuplicate } from "../shared/lists.js";
import { draftUnitMetas, draftUnits, removeUnit } from "../shared/units.js";
import { emptyDb } from "./testDb.js";

// The draft's units as the server's own functions read and remove them.

let db: Db;
let app: ReturnType<typeof createApp>;
const headers = { "content-type": "application/json", "x-dev-role": "ADMIN" };

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db, { devMode: true });
});

/** A study with units `a` and `b`; returns its id. */
async function studyWithUnits(name: string): Promise<number> {
  const study = (await (
    await app.request("/api/study", { method: "POST", headers, body: JSON.stringify({ name }) })
  ).json()) as { id: number };
  const units = ["a", "b"].map((externalId) => ({ externalId, data: { text: `${name} ${externalId}` } }));
  const res = await app.request(`/api/study/${study.id}/units`, {
    method: "POST",
    headers,
    body: JSON.stringify({ units }),
  });
  expect(res.status).toBe(201);
  return study.id;
}

describe("draft units", () => {
  it("removing a unit touches only the study it is asked for", async () => {
    const mine = await studyWithUnits("mine");
    const theirs = await studyWithUnits("theirs");
    const [victim] = await draftUnits(db, theirs);
    await db.transaction((tx) => removeUnit(tx, mine, victim!.id));
    expect((await draftUnits(db, theirs)).map((u) => u.data)).toEqual([{ text: "theirs a" }, { text: "theirs b" }]);
    // The study's own unit goes
    await db.transaction((tx) => removeUnit(tx, theirs, victim!.id));
    expect((await draftUnits(db, theirs)).map((u) => u.externalId)).toEqual(["b"]);
    expect((await draftUnits(db, mine)).length).toBe(2);
  });

  it("lists units by their hash, without their data", async () => {
    const study = await studyWithUnits("listed");
    const withData = await draftUnits(db, study);
    const metas = await draftUnitMetas(db, study);
    expect(metas).toEqual(withData.map(({ id, externalId, hash, coded }) => ({ id, externalId, hash, coded })));
    expect(metas[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    const listed = (await (await app.request(`/api/study/${study}/units`, { headers })).json()) as { units: unknown[] };
    expect(listed.units).toEqual(metas);
  });
});

describe("firstDuplicate", () => {
  it("finds the first value given twice, also in a long list", () => {
    expect(firstDuplicate(["a", "b", "c"])).toBeUndefined();
    expect(firstDuplicate(["a", "b", "a", "b"])).toBe("a");
    const many = Array.from({ length: 200_000 }, (_, i) => `u${i}`);
    const started = Date.now();
    expect(firstDuplicate([...many, "u7"])).toBe("u7");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
