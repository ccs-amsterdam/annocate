import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "./item.js";
import { toCoderItems } from "./coderCodebook.js";

describe("the coder codebook", () => {
  it("leaves out how units are handed out, the Session item, and how experiments are drawn", () => {
    const items = [
      { type: "session", invite: { mode: "crowd" } },
      {
        type: "experiment",
        name: "condition",
        variable: {
          type: "random",
          draw: "balanced",
          stratify: ["session.wave"],
          units: true,
          options: [{ value: "a", label: "A", weight: 2 }],
        },
      },
      {
        type: "branch",
        condition: { script: "true" },
        children: [
          {
            type: "unit_loop",
            label: "Main",
            order: "random",
            units: {
              part: "pre",
              criteria: { codersPerUnit: { min: 2, max: 2 } },
              overlap: { placement: "last" },
            },
            children: [
              { type: "layout", template: "$unit.text" },
              { type: "question", name: "q", variable: { type: "confirm", question: "?" } },
            ],
          },
        ],
      },
    ] as TopLevelItem[];
    expect(toCoderItems(items)).toEqual([
      { type: "experiment", name: "condition", variable: { type: "random", options: [{ value: "a", label: "A" }] } },
      {
        type: "branch",
        condition: { script: "true" },
        children: [
          {
            type: "unit_loop",
            label: "Main",
            order: "random",
            children: [
              { type: "layout", template: "$unit.text" },
              { type: "question", name: "q", variable: { type: "confirm", question: "?" } },
            ],
          },
        ],
      },
    ]);
  });

  it("gives an experiment with condition_set's free values no options, and leaves out its URL parameter", () => {
    const items = [
      { type: "experiment", name: "set", variable: { type: "random", draw: "url_param", param: "arm", units: true } },
    ] as TopLevelItem[];
    expect(toCoderItems(items)).toEqual([
      { type: "experiment", name: "set", variable: { type: "random", options: [] } },
    ]);
  });
});
