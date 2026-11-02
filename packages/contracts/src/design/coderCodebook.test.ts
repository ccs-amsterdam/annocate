import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "./item.js";
import { toCoderItems } from "./coderCodebook.js";

describe("the coder codebook", () => {
  it("leaves out how units are handed out, the Session item, and how auto questions are drawn", () => {
    const items = [
      { type: "session", params: [{ name: "part", kind: "link", values: { sets: "g" } }] },
      {
        type: "question",
        name: "condition",
        variable: { type: "auto", source: "balanced", stratify: ["session.wave"], options: [{ value: "a", label: "A", weight: 2 }] },
      },
      {
        type: "condition",
        condition: { script: "true" },
        children: [
          {
            type: "unit_loop",
            label: "Main",
            order: "random",
            units: [
              { when: { script: `$var.condition.is("a")` }, mode: "assign", group: "g", from: { session: "part" }, overlap: { placement: "spread" } },
              { mode: "shared", set: { group: "g", set: "queue" }, until: { coders: 2 }, maxCoders: 2 },
            ],
            layout: { template: "$unit.text" },
            children: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }],
          },
        ],
      },
    ] as TopLevelItem[];
    expect(toCoderItems(items)).toEqual([
      { type: "question", name: "condition", variable: { type: "auto", options: [{ value: "a", label: "A" }] } },
      {
        type: "condition",
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
});
