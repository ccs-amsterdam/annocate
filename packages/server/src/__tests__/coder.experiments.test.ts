import { describe, expect, it } from "vitest";
import { splitDesignItems } from "@annotinder/contracts";

import {
  adminHeaders,
  server,
  restart,
  send,
  coder,
  sentimentQuestion,
  redeploy,
  createSet,
  reach,
  sessionItem,
  useServer,
} from "./coderHarness.js";

describe("experiments that select units", () => {
  const part = {
    type: "experiment",
    name: "part",
    variable: { type: "experiment", draw: "balanced", selectsUnits: true },
  };

  it("draw from condition_set's values when reached, or when a loop after them needs them", async () => {
    await createSet("p1", ["unit-1"], "condition_set");
    await createSet("p2", ["unit-2"], "condition_set");
    await redeploy({}, [part]);
    const a = coder("a");
    expect(await reach(a, "part")).toEqual([{ value: "p1" }]);
    expect((await a.session()).session).toMatchObject({ part: "p1" });
    expect((await a.next())!.externalId).toBe("unit-1");
    // b never reached it (e.g. it was hidden): assigned when the loop needs it
    const b = coder("b");
    expect((await b.next())!.externalId).toBe("unit-2");
    expect((await b.session()).variables.part).toMatchObject({ values: [{ value: "p2" }] });
  });

  it("don't select the units of loops before them", async () => {
    await createSet("p1", ["unit-1"], "condition_set");
    const loopBefore = {
      type: "unit_loop",
      id: "loop_1",
      label: "before",
      units: {},
      children: [
        { type: "layout", template: "" },
        { type: "question", name: "other", variable: { type: "confirm", question: "?" } },
      ],
    };
    await redeploy({}, [loopBefore, part]);
    const a = coder("a");
    const first = (await a.batch(10, "loop_1")).map((u) => u.externalId);
    expect(first.length).toBeGreaterThan(1);
    expect((await a.batch(10, "loop_2")).map((u) => u.externalId)).toEqual(["unit-1"]);
  });
});

describe("balanced draws", () => {
  it("break a tie at random", async () => {
    const experiment = {
      type: "experiment",
      name: "arm",
      variable: { type: "experiment", draw: "balanced", options: [{ value: "a" }, { value: "b" }, { value: "c" }] },
    };
    await redeploy({}, [experiment]);
    // random() near 1: the last of the tied values; then only the values with the fewest are candidates
    useServer(restart({ random: () => 0.99 }));
    expect(await reach(coder("x1"), "arm")).toEqual([{ value: "c" }]);
    expect(await reach(coder("x2"), "arm")).toEqual([{ value: "b" }]);
    useServer(restart({ random: () => 0 }));
    expect(await reach(coder("x3"), "arm")).toEqual([{ value: "a" }]);
    expect(await reach(coder("x4"), "arm")).toEqual([{ value: "a" }]);
  });
});

describe("conditions from a URL parameter", () => {
  const study = sessionItem({
    invite: { mode: "crowd" },
    urlParams: [{ name: "arm", values: [{ value: "a" }, { value: "b" }], default: "a" }],
  });
  const experiment = (extra: object) => ({
    type: "experiment",
    name: "condition",
    variable: { type: "experiment", draw: "url_param", param: "arm", ...extra },
  });
  const start = async (device: string, arm: string) => {
    await send(device, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": `arm=${arm}` });
    return coder(device, null);
  };

  it("are the parameter's value, nothing drawn; with units, the condition's units", async () => {
    await createSet("a", ["unit-1"], "condition_set");
    await createSet("b", ["unit-2", "unit-3"], "condition_set");
    await redeploy({}, [study, experiment({ selectsUnits: true })]);
    const b = await start("b-coder", "b");
    expect(await reach(b, "condition")).toEqual([{ value: "b" }]);
    expect((await b.batch(10)).map((u) => u.externalId)).toEqual(["unit-2", "unit-3"]);
    // Reached by a loop first: the same
    const a = await start("a-coder", "a");
    expect((await a.batch(10)).map((u) => u.externalId)).toEqual(["unit-1"]);
    expect((await a.session()).variables.condition).toMatchObject({ values: [{ value: "a" }] });
  });

  it("must be the conditions: the design's, and condition_set's when deployed", async () => {
    const deploy = async (items: object[]) => {
      const design = await server.request("/api/study/1/design", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(
          splitDesignItems([
            ...items,
            { type: "unit_loop", id: "loop_1", children: [{ type: "layout", template: "" }, sentimentQuestion] },
          ]),
        ),
      });
      expect(design.status).toBe(201);
      const { id } = (await design.json()) as { id: number };
      const res = await server.request("/api/study/1/deployment", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ designVersionId: id, units: true }),
      });
      return { status: res.status, body: (await res.json()) as { error?: string; warnings?: string[] } };
    };
    const designed = await deploy([study, experiment({ options: [{ value: "a" }, { value: "c" }] })]);
    expect(designed.status).toBe(400);
    expect(designed.body.error).toContain("issues");
    // condition_set lacks b, one of the parameter's values
    await createSet("a", ["unit-1"], "condition_set");
    const deployed = await deploy([study, experiment({ selectsUnits: true })]);
    expect(deployed).toMatchObject({
      status: 400,
      body: { error: expect.stringContaining("condition_set has no units for 'b'") },
    });
  });
});
