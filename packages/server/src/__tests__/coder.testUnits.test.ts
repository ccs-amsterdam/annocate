import { describe, expect, it } from "vitest";
import type { CoderProgress } from "@annotinder/contracts";

import {
  adminHeaders,
  server,
  send,
  coder,
  sentiment,
  unitByExternalId,
  redeploy,
  draftUnit,
  createSet,
  listOf,
  links,
  crowd,
  codersInvite,
} from "./coderHarness.js";

describe("practice and gold units", () => {
  it("practice units come first, with their checks; gold units are checked silently, and health running out ends the session", async () => {
    const { data: base } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        units: [
          {
            externalId: "p1",
            data: {
              ...base,
              answer_sentiment: "negative",
              feedback_sentiment: "It reports a disaster.",
            },
          },
          {
            externalId: "g1",
            data: { ...base, answer_sentiment: "neutral", feedback_sentiment: null },
          },
          {
            externalId: "g2",
            data: { ...base, answer_sentiment: "neutral", feedback_sentiment: null },
          },
        ],
      }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    // Test units without a part are in the loop's part too
    await createSet("s1", ["unit-1"], "part_set");
    await createSet("practice", ["p1"], "test_set");
    await createSet("gold", ["g1", "g2"], "test_set");
    const end = { type: "end", name: "low_quality", outcome: "screenout", message: "Thank you" };
    await redeploy(
      {
        units: {
          part: "s1",
          practice: "before",
          practiceCheck: { questions: ["sentiment"] },
          gold: "after",
          goldCheck: { questions: ["sentiment"], health: { start: 2, wrong: -1, end: "low_quality" } },
        },
      },
      [crowd(), end],
    );
    const c = coder("trainee");
    const submit = async (unitId: number, code: string) => {
      const res = await c.submit(unitId, sentiment(code));
      expect(res.status).toBe(200);
      return res.json();
    };
    // The practice unit first, marked as such; its answer columns are never served
    const practice = (await c.next())!;
    expect(practice.externalId).toBe("p1");
    expect(practice.data).toMatchObject({ test_set: "practice" });
    expect(practice.data).not.toHaveProperty("answer_sentiment");
    expect(practice.data).not.toHaveProperty("feedback_sentiment");
    // Its checks come along, for the browser (retry by default); the server doesn't check practice
    expect(practice.practice).toEqual({
      retry: true,
      questions: { sentiment: { key: "negative", message: "It reports a disaster." } },
    });
    expect(await submit(practice.id, "negative")).toEqual({});
    // Then their own unit, then the gold units: nothing tells them they are gold
    const own = (await c.next())!;
    expect(own.externalId).toBe("unit-1");
    expect(own.data).not.toHaveProperty("test_set");
    expect(await submit(own.id, "positive")).toEqual({});
    const g1 = (await c.next())!;
    expect(g1.data).not.toHaveProperty("answer_sentiment");
    expect(g1.data).not.toHaveProperty("test_set");
    expect(await submit(g1.id, "positive")).toEqual({}); // wrong: health 1
    const g2 = (await c.next())!;
    expect(await submit(g2.id, "positive")).toEqual({ end: "low_quality" }); // wrong again: health 0
    expect((await c.session()).ended).toMatchObject({ item: "low_quality", outcome: "screenout" });
    // The Coders page (Sessions) counts the test units each coder finished
    const coders = (await listOf("sessions")) as {
      ended: unknown;
      testUnits: object;
    }[];
    expect(coders.find((x) => x.ended)?.testUnits).toEqual({
      practice: { done: 1, total: 1 },
      gold: { done: 2, total: 2 },
    });

    // A design that uses `$unit.test_set` gets it with every unit (null for a coding unit)
    await redeploy(
      { units: { part: "s1", practice: "before", gold: "after" }, layout: { template: "$unit.test_set" } },
      [crowd()],
    );
    const d = coder("designer");
    const types: unknown[] = [];
    for (let unit = await d.next(); unit; unit = await d.next()) {
      types.push(unit.data.test_set);
      expect((await d.submit(unit.id, sentiment("neutral"))).status).toBe(200);
    }
    expect(types).toEqual(["practice", null, "gold", "gold"]);
  });
});

describe("test units per coder", () => {
  it("count the practice, gold and overlap units the coder finished", async () => {
    const { data: base } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        units: ["g1"].map((externalId) => ({ externalId, data: { ...base, answer_sentiment: "neutral" } })),
      }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    await createSet("s1", ["unit-1"], "coder_set");
    await createSet("overlap", ["unit-2"], "test_set");
    await createSet("gold", ["g1"], "test_set");
    await redeploy({ units: { overlap: "after", gold: "after", goldCheck: { questions: ["sentiment"] } } }, [
      codersInvite(),
    ]);
    const [{ secret }] = (await links()).filter((l) => !l.retiredAt);
    const c = coder("routed", secret);
    const seen: string[] = [];
    for (let unit = await c.next(); unit; unit = await c.next()) {
      seen.push(unit.externalId);
      expect((await c.submit(unit.id, sentiment("positive"))).status).toBe(200);
    }
    expect(seen).toEqual(["unit-1", "unit-2", "g1"]);
    // A coder who never asked for units: not routed, so no test units yet
    await send("idle", "/session", {}, { "x-link-secret": secret, "x-new-session": "1" });
    const coders = (await listOf("sessions")) as CoderProgress[];
    const routed = coders.find((x) => x.finished.some((f) => f.title === "main_loop" && f.units === 3))!;
    expect(routed.testUnits).toEqual({ overlap: { done: 1, total: 1 }, gold: { done: 1, total: 1 } });
    expect(coders.filter((x) => x.id !== routed.id).map((x) => x.testUnits)).toEqual([{}]);
  });
});
