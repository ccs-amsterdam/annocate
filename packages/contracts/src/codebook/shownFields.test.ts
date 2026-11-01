import { describe, expect, it } from "vitest";
import { loopDependencies, shownUnitFields, fieldUsage, undeclaredFields } from "./shownFields.js";

const loop = {
  type: "unit_loop",
  units: [
    { mode: "all", when: { script: "$var.group.is('a') && $var.slot.is('1')" } },
    { mode: "assign", group: "parts", from: { draw: "balanced" }, overlap: { placement: "disabled" } },
  ],
  layout: { template: "{{$unit.headline}} as {{$var.role.label}}" },
  children: [
    { type: "question", name: "topic", variable: { type: "nominal", question: "Topic of {{$unit.text}}?", options: [{ value: "a" }] } },
    {
      type: "condition",
      condition: { script: "$var.topic.is('a') && $var.age.gt(18)" },
      children: [{ type: "question", name: "tone", variable: { type: "nominal", question: "Tone?", options: [{ value: "x" }] } }],
    },
  ],
};

describe("what unit loops refer to", () => {
  it("lists the unit fields shown", () => {
    expect(shownUnitFields([loop]).sort()).toEqual(["headline", "text"]);
  });

  it("lists the coder-level questions a loop depends on: in its layout, conditions and branches, not its own questions", () => {
    expect(loopDependencies([loop]).get("1")?.sort()).toEqual(["age", "group", "role", "slot"]);
  });
});

describe("fieldUsage", () => {
  it("tells shown fields from fields only conditions use, and answer columns", () => {
    const items = [
      {
        type: "unit_loop",
        units: [{ mode: "assign", group: "g", from: { draw: "balanced" }, gold: { placement: "last", questions: ["topic"] } }],
        layout: { template: "$unit.title" },
        children: [
          { type: "condition", condition: { script: "$unit.year > 2000" }, children: [
            { type: "question", name: "topic", variable: { type: "nominal", question: "About $unit.title?", options: [{ value: "a" }] } },
          ] },
          { type: "question", name: "who", variable: { type: "span", question: "Who?", fields: ["body"] } },
        ],
      },
    ];
    expect(Object.fromEntries(fieldUsage(items))).toEqual({ title: "shown", year: "sent", body: "shown", topic_gold: "server" });
    expect(undeclaredFields(items, [{ name: "title" }])).toEqual(["body", "year", "topic_gold"]);
  });
});
