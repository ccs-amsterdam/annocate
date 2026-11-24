import { describe, expect, it } from "vitest";
import { loopDependencies, shownUnitFields, fieldUsage, undeclaredFields, designSetColumns } from "./shownFields.js";
import { loopShareColumns } from "./assignment.js";

const loop = {
  type: "unit_loop",
  id: "loop_1",
  units: { part: "a", overlap: "ignore" },
  children: [
    { type: "layout", template: "{{$unit.headline}} as {{$var.role.label}}" },
    {
      type: "question",
      name: "topic",
      variable: { type: "nominal", question: "Topic of {{$unit.text}}?", options: [{ value: "a" }] },
    },
    {
      type: "branch",
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
    expect(loopDependencies([loop]).get("loop_1")?.sort()).toEqual(["age", "group", "role", "slot"]);
  });
});

describe("fieldUsage", () => {
  it("tells shown fields from fields only conditions use, and answer columns", () => {
    const items = [
      {
        type: "unit_loop",
        id: "loop_1",
        units: { gold: "after", goldCheck: { questions: ["topic"] }, practiceCheck: { questions: ["topic"] } },
        children: [
          { type: "layout", template: "$unit.title" },
          {
            type: "branch",
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
      test_set: "server",
    });
    expect(undeclaredFields(items, [{ name: "title" }])).toEqual(["body", "year", "answer_topic", "feedback_topic"]);
  });
});

describe("set columns", () => {
  const items = [
    { type: "session", invite: { mode: "coders", link: "per_coder" } },
    { type: "unit_loop", id: "loop_1", children: [{ type: "layout", template: "" }] },
    {
      type: "branch",
      condition: { script: "true" },
      children: [{ type: "experiment", name: "set", variable: { type: "random", draw: "balanced", units: true } }],
    },
    {
      type: "unit_loop",
      id: "loop_2",
      units: { part: "post" },
      children: [{ type: "layout", template: "" }],
    },
  ];

  it("are coder_set (expert coders), condition_set (an experiment that selects units) and part_set (loop parts)", () => {
    expect(designSetColumns(items).sort()).toEqual(["coder_set", "condition_set", "part_set"]);
    expect(Object.fromEntries(fieldUsage(items))).toEqual({
      coder_set: "server",
      condition_set: "server",
      part_set: "server",
      test_set: "server",
    });
    // Deploying checks them against the units: never undeclared fields
    expect(undeclaredFields(items, [])).toEqual([]);
    expect(designSetColumns([{ type: "session", invite: { mode: "crowd" } }])).toEqual([]);
  });

  it("use the test set in every unit loop, and only role columns the design selects by", () => {
    const loop = { type: "unit_loop", id: "loop_1", children: [{ type: "layout", template: "" }] };
    // No loop: a survey uses no unit columns
    expect(fieldUsage([{ type: "session", invite: { mode: "crowd" } }]).size).toBe(0);
    expect(Object.fromEntries(fieldUsage([{ type: "session", invite: { mode: "crowd" } }, loop]))).toEqual({
      test_set: "server",
    });
    // `$unit.test_set` in a layout: sent with the units
    const shown = { ...loop, children: [{ type: "layout", template: "{{$unit.test_set}}" }] };
    expect(fieldUsage([shown]).get("test_set")).toBe("shown");
    expect(undeclaredFields([shown], [])).toEqual([]);
  });

  it("select a loop's units: the coder's, and the experiment before the loop", () => {
    const shares = loopShareColumns(items);
    expect(shares.get("loop_1")).toEqual([{ name: "coder", column: "coder_set" }]);
    expect(shares.get("loop_2")).toEqual([...shares.get("loop_1")!, { name: "set", column: "condition_set", random: true }]);
  });
});
