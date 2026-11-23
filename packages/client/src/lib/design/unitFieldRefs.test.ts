import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { pathOfItem, unknownUnitFields } from "./unitFieldRefs";

const items = [
  {
    type: "unit_loop",
    label: "loop",
    children: [
      { type: "layout", template: "# {{$unit.headline}}\n\n$unit.body" },
      { type: "question", name: "q1", variable: { type: "confirm", question: "Is {{$unit.topic}} right?" } },
      {
        type: "block",
        condition: { script: "$unit.source === 'x'" },
        children: [
          { type: "question", name: "q2", variable: { type: "confirm", question: "'$unit.quoted' $unit.body" } },
        ],
      },
      {
        type: "question",
        name: "spans",
        variable: { type: "span", question: "?", fields: ["unit.note"], options: [] },
      },
      {
        type: "question",
        name: "spans2",
        variable: { type: "span", question: "?", fields: ["unit.text"], options: [] },
      },
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

  it("knows $unit.id and $unit.test_set, which every unit has", () => {
    const loop = [
      {
        type: "unit_loop",
        label: "loop",
        children: [{ type: "layout", template: '::: if $unit.test_set === "practice"\nPractice\n:::\n\n$unit.id' }],
      },
    ] as unknown as TopLevelItem[];
    expect(unknownUnitFields(loop, [{ name: "headline", type: "text" }], true)).toEqual([]);
  });

  it("checks nothing while the study has no units, unless asked to (to locate undeclared fields)", () => {
    expect(unknownUnitFields(items, [])).toEqual([]);
    expect(unknownUnitFields(items, [], true).map((w) => w.field)).toContain("topic");
  });
});

describe("pathOfItem", () => {
  it("finds an item by its title, as a validation issue path", () => {
    expect(pathOfItem(items, "loop")).toEqual([0]);
    expect(pathOfItem(items, "q1")).toEqual([0, "children", 1]);
    expect(pathOfItem(items, "nope")).toBeNull();
    const withElse = [
      {
        type: "block",
        condition: { script: "true" },
        children: [items[0]],
        elseChildren: [{ type: "end", name: "e" }],
      },
    ] as unknown as TopLevelItem[];
    expect(pathOfItem(withElse, "q1")).toEqual([0, "children", 0, "children", 1]);
    expect(pathOfItem(withElse, "e")).toEqual([0, "elseChildren", 0]);
  });
});
