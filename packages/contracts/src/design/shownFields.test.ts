import { describe, expect, it } from "vitest";
import { loopDependencies, shownUnitFields, fieldUsage, undeclaredFields, designSetColumns } from "./shownFields.js";
import { loopShareColumns } from "./assignment.js";

const loop = {
  type: "unit_loop",
  units: { part: "a", overlap: "ignore" },
  children: [
    { type: "layout", template: "{{$unit.headline}} as {{$var.role.label}}" },
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
        units: { gold: "after", goldCheck: { questions: ["topic"] }, practiceCheck: { questions: ["topic"] } },
        children: [
          { type: "layout", template: "$unit.title" },
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
      answer_topic: "server",
      feedback_topic: "server",
    });
    expect(undeclaredFields(items, [{ name: "title" }])).toEqual(["body", "year", "answer_topic", "feedback_topic"]);
  });
});

describe("set columns", () => {
  const items = [
    { type: "session", invite: { mode: "coders", link: "per_coder" } },
    { type: "unit_loop", children: [{ type: "layout", template: "" }] },
    {
      type: "block",
      condition: { script: "true" },
      children: [{ type: "experiment", name: "set", variable: { type: "random", draw: "balanced", units: true } }],
    },
    {
      type: "unit_loop",
      units: { part: "post" },
      children: [{ type: "layout", template: "" }],
    },
  ];

  it("are coder_set (specific coders), condition_set (an experiment that selects units) and part_set (loop parts)", () => {
    expect(designSetColumns(items).sort()).toEqual(["coder_set", "condition_set", "part_set"]);
    expect(Object.fromEntries(fieldUsage(items))).toEqual({
      coder_set: "server",
      condition_set: "server",
      part_set: "server",
    });
    // Deploying checks them against the units: never undeclared fields
    expect(undeclaredFields(items, [])).toEqual([]);
    expect(designSetColumns([{ type: "session", invite: { mode: "crowd" } }])).toEqual([]);
  });

  it("select a loop's units: the coder's, and the experiment before the loop", () => {
    const shares = loopShareColumns(items);
    expect(shares.get("1")).toEqual([{ name: "coder", column: "coder_set" }]);
    expect(shares.get("2")).toEqual([...shares.get("1")!, { name: "set", column: "condition_set", random: true }]);
  });
});
