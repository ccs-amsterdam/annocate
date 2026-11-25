import { describe, expect, it } from "vitest";
import { DbStore } from "../runtime/dbStore.js";
import type { Store } from "../runtime/store.js";
import { createApp } from "../app.js";
import { DEMO_PUBLIC_ID } from "../db/publicId.js";
import { query } from "./testDb.js";
import { eq } from "drizzle-orm";
import { annotationValues } from "../db/schema/index.js";
import { unitVersionData } from "../db/sql.js";
import {
  adminHeaders,
  coder,
  db,
  deployDrafts,
  draftUnit,
  redeploy,
  sentiment,
  sentimentQuestion,
  server,
} from "./coderHarness.js";

// A deploy while coders are at work.

describe("a deploy while coders work", () => {
  const codings = () =>
    query<{ loop: string; unitId: number }>(
      db,
      `SELECT loop_key AS loop, unit_id::int AS "unitId" FROM unit_codings ORDER BY 1, 2`,
    );

  it("a loop put before the one coders are in: their progress stays with their loop", async () => {
    await redeploy({});
    const c = coder("steady");
    const first = (await c.next())!;
    expect((await c.submit(first.id, sentiment("positive"))).status).toBe(200);
    const held = (await c.next())!;

    // A practice loop comes first in the design; the loop coders are in keeps its id
    const practice = {
      type: "unit_loop",
      id: "loop_2",
      label: "practice",
      units: {},
      children: [
        { type: "layout", template: "" },
        { ...sentimentQuestion, name: "practice_sentiment" },
      ],
    };
    await redeploy({}, [practice]);

    const progress = Object.fromEntries((await c.session()).progress.map((p) => [p.loop, p.doneUnitIds]));
    expect(progress).toEqual({ loop_2: [], loop_1: [first.id] });
    expect(await codings()).toEqual([{ loop: "loop_1", unitId: first.id }]);
    // They go on where they were, and the new loop starts at its first unit
    expect((await c.next("loop_1"))!.id).toBe(held.id);
    expect((await c.submit(held.id, sentiment("negative"), "loop_1")).status).toBe(200);
    expect((await c.next("loop_2"))!.id).toBe(first.id);
  });

  it("a unit whose content a deploy replaced while a coder had it: the answer is about the content there is", async () => {
    await redeploy({});
    const c = coder("mid-unit");
    const unit = (await c.next())!;
    const { externalId, data } = await draftUnit(unit.id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId, data: { ...data, text: "corrected" } }], overwrite: true }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    // The version the coder was shown had no answers yet: the deploy deletes it
    await deployDrafts();
    expect(await query(db, "SELECT id FROM unit_versions WHERE unit_id = $1", [unit.id])).toHaveLength(1);

    expect((await c.submit(unit.id, sentiment("positive"))).status).toBe(200);
    const [answer] = await db
      .select({ data: unitVersionData(annotationValues.unitVersionId) })
      .from(annotationValues)
      .where(eq(annotationValues.unitId, unit.id));
    expect(answer?.data.text).toBe("corrected");
  });

  it("a unit a deploy took out while a coder had it: the answer is refused", async () => {
    await redeploy({});
    const c = coder("removed");
    const unit = (await c.next())!;
    const removed = await server.request(`/api/study/1/units/${unit.id}`, { method: "DELETE", headers: adminHeaders });
    expect(removed.status, await removed.clone().text()).toBeLessThan(300);
    await deployDrafts();
    const res = await c.submit(unit.id, sentiment("positive"));
    expect([res.status, await res.json()]).toEqual([409, { error: "Unit is not assigned to this coder" }]);
    expect(await query(db, "SELECT id FROM annotation_values WHERE unit_id = $1", [unit.id])).toEqual([]);
  });

  it("codings that can't be rederived (a failure in the middle) stay as they were, and are rederived on the next request", async () => {
    await redeploy({});
    const c = coder("rederived");
    const unit = (await c.next())!;
    expect((await c.submit(unit.id, sentiment("positive"))).status).toBe(200);
    const before = await codings();
    const basis = () => query<{ basis: string | null }>(db, "SELECT codings_basis AS basis FROM deployments");
    const [{ basis: oldBasis }] = await basis();

    // The loop gains a question: the codings must be derived again. The first try fails after deleting them.
    let failures = 1;
    const failing = (store: Store): Store =>
      new Proxy(store, {
        get(target, prop, receiver) {
          if (prop === "locked")
            return (key: string, fn: (s: Store) => Promise<unknown>, options?: { long?: boolean }) =>
              target.locked(key, (inner) => fn(failing(inner)), options);
          if (prop === "replaceCodings" && target instanceof DbStore)
            return async (...args: Parameters<Store["replaceCodings"]>) => {
              await target.replaceCodings(args[0], []);
              if (failures-- > 0) throw new Error("the database went away");
              return target.replaceCodings(...args);
            };
          const value = Reflect.get(target, prop, receiver) as unknown;
          return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
    const app = createApp(db, { secret: "test-secret", devMode: true, wrapStore: failing });
    const relevance = {
      type: "question",
      name: "relevance",
      variable: { type: "nominal", question: "?", options: [{ value: "yes" }, { value: "no" }] },
    };
    await redeploy({ children: [{ type: "layout", template: "" }, sentimentQuestion, relevance] });
    const session = () =>
      app.request(`/api/d/${DEMO_PUBLIC_ID}/session`, {
        headers: { "x-annotinder": "1", "x-link-secret": "demo-secret" },
      });

    expect((await session()).status).toBe(500);
    expect(await codings()).toEqual(before);
    expect(await basis()).toEqual([{ basis: oldBasis }]);
    // The next request derives them: the unit isn't finished under the new design
    expect((await session()).status).toBe(200);
    expect(await codings()).toEqual([]);
    expect((await basis())[0]!.basis).not.toBe(oldBasis);
  });
});
