import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { unknownUnitFields } from "./unitFieldRefs";

const items = [
  {
    type: "unit_loop",
    name: "loop",
    units: [{ mode: "all", unitset: "main" }],
    layout: { template: "# {{$unit.headline}}\n\n$unit.body::tokenize" },
    children: [
      { type: "question", name: "q1", variable: { type: "confirm", question: "Is {{$unit.topic}} right?" } },
      {
        type: "condition",
        condition: { script: "$unit.source === 'x'" },
        children: [{ type: "question", name: "q2", variable: { type: "confirm", question: "'$unit.quoted' $unit.body" } }],
      },
      { type: "question", name: "spans", variable: { type: "span", question: "?", fields: ["note"], options: [] } },
      { type: "question", name: "spans2", variable: { type: "span", question: "?", fields: ["text"], options: [] } },
    ],
  },
] as unknown as TopLevelItem[];

describe("unknownUnitFields", () => {
  it("reports $unit references and span columns that aren't unit fields", () => {
    const fields = [
      { name: "headline", type: "text" as const },
      { name: "body", type: "text" as const },
    ];
    expect(unknownUnitFields(items, fields).map((w) => [w.item, w.field])).toEqual([
      ["q1", "topic"],
      ["if $unit.source === 'x'", "source"],
      ["q2", "quoted"],
      ["spans", "note"],
      ["spans2", "text"],
    ]);
  });

  it("checks nothing while the job has no units", () => {
    expect(unknownUnitFields(items, [])).toEqual([]);
  });
});
