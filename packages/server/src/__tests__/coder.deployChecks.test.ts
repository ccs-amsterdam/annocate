import { describe, expect, it } from "vitest";
import { splitDesignItems } from "@annotinder/contracts";

import {
  chosen,
  adminHeaders,
  server,
  unitByExternalId,
  sentimentQuestion,
  draftUnit,
  createSet,
  addCoders,
  sessionItem,
  crowd,
  codersInvite,
} from "./coderHarness.js";

describe("deploy checks of the columns with a role", () => {
  const loop = (units: object, label = "main") => ({
    type: "unit_loop",
    // A second loop in a design is called b
    id: label === "b" ? "loop_2" : "loop_1",
    label,
    units,
    children: [
      { type: "layout", template: "" },
      { ...sentimentQuestion, name: `sentiment_${label}` },
    ],
  });
  /** Deploys these items (no other loop); the warnings, or the error. */
  const deploy = async (items: object[]) => {
    const design = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(chosen(splitDesignItems(items))),
    });
    expect(design.status, await design.clone().text()).toBe(201);
    const { id } = (await design.json()) as { id: number };
    const res = await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: id, units: true }),
    });
    const body = (await res.json()) as { error?: string; warnings?: string[] };
    return res.status === 200 ? (body.warnings ?? []) : { error: body.error };
  };

  it("warn about parts no loop shows, loop parts no unit has, and units no loop gives anyone", async () => {
    await createSet("pre", ["unit-1"], "part_set");
    await createSet("post", ["unit-2"], "part_set");
    expect(await deploy([loop({ part: "pre" }, "a"), loop({ part: "later" }, "b")])).toEqual([
      "Loop 'b' shows part 'later', but no unit has it in part_set: it gets no units.",
      "Part 'post' isn't shown by any loop.",
      // unit-2 (post) and unit-3 (no part)
      "2 units are in no part set a loop shows and aren't test units: no coder gets them.",
    ]);
    // A loop without a part shows every part
    expect(await deploy([loop({ part: "pre" }, "a"), loop({}, "b")])).toEqual([]);
    // A test unit needs no part
    await createSet("post", ["unit-2", "unit-3"], "part_set");
    await createSet("overlap", ["unit-3"], "test_set");
    expect(await deploy([loop({ part: "pre" }, "a"), loop({ part: "post" }, "b")])).toEqual([]);
  });

  it("warn about units in no coder set; an experiment that selects units needs condition_set", async () => {
    await createSet("anna", ["unit-1"], "coder_set");
    await createSet("overlap", ["unit-2"], "test_set");
    expect(await deploy([codersInvite(), loop({})])).toEqual([
      "1 unit is in no coder set and isn't a test unit: no coder gets it.",
    ]);
    const experiment = {
      type: "experiment",
      name: "framing",
      variable: { type: "experiment", draw: "balanced", selectsUnits: true },
    };
    expect(await deploy([crowd(), experiment, loop({})])).toEqual({
      error:
        "Experiment 'framing' selects units by condition_set, but the units have no condition_set column yet: make one.",
    });
    await createSet("a", ["unit-1"], "condition_set");
    expect(await deploy([crowd(), experiment, loop({})])).toEqual([
      "1 unit is in no condition set and isn't a test unit: no coder gets it.",
    ]);
    const listed = { ...experiment, variable: { ...experiment.variable, options: [{ value: "a" }, { value: "b" }] } };
    expect(await deploy([crowd(), listed, loop({})])).toEqual({
      error: "Experiment 'framing': condition_set has no units for 'b'.",
    });
  });

  it("what the invitation asks of the coders with units: an email address to sign in, no addresses as names to pick", async () => {
    await addCoders(["anna", { coder: "bob@uni.nl", email: "bob@uni.nl" }, "carl"]);
    await createSet("anna", ["unit-1", "unit-2"], "coder_set");
    await createSet("bob@uni.nl", ["unit-3"], "coder_set");
    const invite = (link: string) => sessionItem({ invite: { mode: "coders", link } });
    // carl has no address either, but no units: he isn't asked for one
    expect(await deploy([invite("login"), loop({})])).toEqual({
      error:
        "Coders sign in with their email address, but this coder has none: anna. Give them an email address (Coders), or give each coder a link.",
    });
    expect(await deploy([invite("pick_name"), loop({})])).toEqual([
      "Coders pick their name from a list that anyone with the link sees, and this coder id looks like an email address: bob@uni.nl.",
    ]);
    expect(await deploy([invite("per_coder"), loop({})])).toEqual([]);
  });

  it("warn about checked test units without them or without right answers", async () => {
    const { data: base } = await draftUnit((await unitByExternalId("unit-1")).id);
    // The design has the question before its answer column is uploaded
    await deploy([loop({})]);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "g1", data: { ...base, answer_sentiment_main: "nope|neutral" } }] }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    const checked = loop({ gold: "after", goldCheck: { questions: ["sentiment_main"] } });
    expect(await deploy([checked])).toEqual(["Loop 'main': it checks gold units, but it has none (test_set 'gold')."]);
    await createSet("gold", ["unit-1", "g1"], "test_set");
    expect(await deploy([checked])).toEqual([
      "Loop 'main': answer_sentiment_main has answers that don't fit 'sentiment_main' (g1: nope (not an option)): those can never be right.",
      "Loop 'main': 1 gold unit has no right answer for 'sentiment_main' in column answer_sentiment_main (unit-1): they aren't checked.",
    ]);
  });
});
