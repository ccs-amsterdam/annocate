import { describe, expect, it } from "vitest";
import { loopDependencies, shownUnitFields } from "./shownFields.js";

const loop = {
  type: "unit_loop",
  units: [
    { mode: "all", unitset: "part_{{$var.slot.value}}", when: { script: "$var.group.is('a')" } },
    { mode: "sets", unitsets: ["x", "y"] },
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
