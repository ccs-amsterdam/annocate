import { describe, expect, it } from "vitest";
import { validateDesignItems } from "./validation.js";

const session = { type: "session", invite: { mode: "crowd" } };
const errors = (items: object[]) =>
  validateDesignItems(items as never)
    .filter((i) => !i.warning)
    .map((i) => i.message);

describe("the names of types in a stored design", () => {
  const swipe = (type: string) => ({
    type: "unit_loop",
    id: "loop_1",
    children: [
      { type: "layout", template: "" },
      {
        type: "question",
        name: "q",
        variable: { type, question: "?", options: [{ value: "no" }, { value: "yes" }] },
      },
    ],
  });

  it("a swipe question is `swipe` (the product's name is not a type)", () => {
    expect(errors([session, swipe("swipe")])).toEqual([]);
    expect(errors([session, swipe("annotinder")])).not.toEqual([]);
  });

  const experiment = (variable: object) => ({ type: "experiment", name: "arm", variable });
  const options = [{ value: "a" }, { value: "b" }];

  it("an experiment's variable is `experiment`, and it selects units with `selectsUnits`", () => {
    expect(errors([session, experiment({ type: "experiment", draw: "balanced", options })])).toEqual([]);
    expect(errors([session, experiment({ type: "experiment", draw: "balanced", selectsUnits: true })])).toEqual([]);
    // The names from before the release are not accepted
    expect(errors([session, experiment({ type: "random", draw: "balanced", options })])).not.toEqual([]);
    expect(errors([session, experiment({ type: "experiment", draw: "balanced", options, units: true })])).toEqual([
      expect.stringContaining("units"),
    ]);
  });
});
