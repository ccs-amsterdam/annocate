import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "./item.js";
import { toCoderItems } from "./coderCodebook.js";

describe("the coder codebook", () => {
  it("leaves out how units are handed out, the Session item, and how random conditions are drawn", () => {
    const items = [
      { type: "session", params: [], coders: { column: "coder" } },
      {
        type: "question",
        name: "condition",
        variable: { type: "random_condition", draw: "balanced", stratify: ["session.wave"], options: [{ value: "a", label: "A", weight: 2 }] },
      },
      {
        type: "show_if",
        condition: { script: "true" },
        children: [
          {
            type: "unit_loop",
            label: "Main",
            order: "random",
            units: [
              { when: { script: `$var.condition.is("a")` }, filter: { column: "g", only: ["queue"] }, overlap: { placement: "spread" } },
              { criteria: { codersPerUnit: { min: 2, max: 2 } } },
            ],
            layout: { template: "$unit.text" },
            children: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }],
          },
        ],
      },
    ] as TopLevelItem[];
    expect(toCoderItems(items)).toEqual([
      { type: "question", name: "condition", variable: { type: "random_condition", options: [{ value: "a", label: "A" }] } },
      {
        type: "show_if",
        condition: { script: "true" },
        children: [
          {
            type: "unit_loop",
            label: "Main",
            order: "random",
            units: [{ when: { script: `$var.condition.is("a")` } }, {}],
            layout: { template: "$unit.text" },
            children: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }],
          },
        ],
      },
    ]);
  });

  it("gives a random condition with a column's free values no options", () => {
    const items = [{ type: "question", name: "set", variable: { type: "random_condition", draw: "random", units: "set" } }] as TopLevelItem[];
    expect(toCoderItems(items)).toEqual([{ type: "question", name: "set", variable: { type: "random_condition", options: [] } }]);
  });
});
