import { describe, expect, it } from "vitest";
import {
  loopDependencies,
  shownUnitFields,
  fieldUsage,
  undeclaredFields,
  designSetColumns,
  notSetColumns,
} from "./shownFields.js";
import { loopShareColumns } from "./assignment.js";

const loop = {
  type: "unit_loop",
  units: { subset: { column: "parts", sets: ["a"] }, overlap: "ignore" },
  layout: { template: "{{$unit.headline}} as {{$var.role.label}}" },
  children: [
    {
      type: "question",
      name: "topic",
      variable: { type: "nominal", question: "Topic of {{$unit.text}}?", options: [{ value: "a" }] },
    },
    {
      type: "block",
      condition: { script: "$var.topic.is('a') && $var.age.gt(18) && $var.group.is('a') && $var.slot.is('1')" },
      children: [
        { type: "question", name: "tone", variable: { type: "nominal", question: "Tone?", options: [{ value: "x" }] } },
      ],
    },
  ],
};

describe("what unit loops refer to", () => {
  it("lists the unit fields shown", () => {
    expect(shownUnitFields([loop]).sort()).toEqual(["headline", "text"]);
  });

  it("lists the coder-level questions a loop depends on: in its layout and conditions, not its own questions", () => {
    expect(loopDependencies([loop]).get("1")?.sort()).toEqual(["age", "group", "role", "slot"]);
  });
});

describe("fieldUsage", () => {
  it("tells shown fields from fields only conditions use, and answer columns", () => {
    const items = [
      {
        type: "unit_loop",
        units: { gold: "after", goldCheck: { questions: ["topic"] } },
        layout: { template: "$unit.title" },
        children: [
          {
            type: "block",
            condition: { script: "$unit.year > 2000" },
            children: [
              {
                type: "question",
                name: "topic",
                variable: { type: "nominal", question: "About $unit.title?", options: [{ value: "a" }] },
              },
            ],
          },
          { type: "question", name: "who", variable: { type: "span", question: "Who?", fields: ["body"] } },
        ],
      },
    ];
    expect(Object.fromEntries(fieldUsage(items))).toEqual({
      title: "shown",
      year: "sent",
      body: "shown",
      topic_gold: "server",
    });
    expect(undeclaredFields(items, [{ name: "title" }])).toEqual(["body", "year", "topic_gold"]);
  });
});

describe("set columns", () => {
  const items = [
    { type: "session", invite: { mode: "coders", column: "coder", link: "per_coder" } },
    { type: "unit_loop", layout: { template: "" }, children: [] },
    {
      type: "block",
      condition: { script: "true" },
      children: [{ type: "computed", name: "set", variable: { type: "random", draw: "balanced", units: "set" } }],
    },
    {
      type: "unit_loop",
      units: { subset: { column: "phase", sets: ["post"] } },
      layout: { template: "" },
      children: [],
    },
  ];

  it("are the coder column, computed items' and filters' columns: used, and declared as set fields", () => {
    expect(designSetColumns(items).sort()).toEqual(["coder", "phase", "set"]);
    expect(Object.fromEntries(fieldUsage(items))).toEqual({
      coder: "server",
      phase: "server",
      set: "server",
    });
    expect(undeclaredFields(items, [{ name: "coder" }, { name: "set" }])).toEqual(["phase"]);
    expect(
      notSetColumns(items, [
        { name: "coder", type: "set" },
        { name: "set", type: "text" },
      ]),
    ).toEqual(["set"]);
  });

  it("select a loop's units: the coder's, and computed items before the loop", () => {
    const shares = loopShareColumns(items);
    expect(shares.get("1")).toEqual([{ name: "coder", column: "coder" }]);
    expect(shares.get("2")).toEqual([...shares.get("1")!, { name: "set", column: "set", random: true }]);
  });
});
