import { describe, expect, it } from "vitest";
import { parseSimpleCondition, type AnyVariableType } from "@annotinder/contracts";
import { conditionToRows, defaultRow, rowsToScript, ruleTargets } from "./conditionRules";

const targets = ruleTargets([
  { name: "role", variable: { type: "nominal", question: "?", options: [{ value: "a" }, { value: "b" }] } },
  { name: "topics", variable: { type: "nominal", multiple: true, question: "?", options: [{ value: "x" }, { value: "y" }] } },
  { name: "age", variable: { type: "numeric", question: "?" } },
  { name: "battery", variable: { type: "scale", question: "?", items: [{ name: "tech" }], options: [{ value: 1 }, { value: 5 }] } },
] as { name: string; variable: AnyVariableType }[]);

const roundTrip = (script: string) => {
  const rows = conditionToRows(parseSimpleCondition(script)!, targets);
  return rows && rowsToScript(rows, targets);
};

describe("condition rules", () => {
  it("lists scale items as their own targets", () => {
    expect(targets.map((t) => [t.label, t.kind])).toEqual([
      ["role", "single"],
      ["topics", "multiple"],
      ["age", "numeric"],
      ["battery", "scale"],
      ["battery › tech", "ordinal"],
    ]);
  });

  it("reads flat simple conditions as rows and writes them back", () => {
    for (const script of [
      `$var.role.is("a")`,
      `!$var.role.is("a") || $var.topics.hasAll("x", "y")`,
      `$var.age.between(18, 65) && !$var.topics.answered && ($var.topics.count() >= 2)`,
      `$var.battery.items.tech.gte(5)`,
      "true",
    ]) {
      expect(roundTrip(script)).toBe(script);
    }
  });

  it("leaves nested conditions and unknown questions to the script editor", () => {
    expect(roundTrip(`$var.role.is("a") && ($var.age.gt(1) || $var.age.lt(0))`)).toBeNull();
    expect(roundTrip(`$var.other.is("a")`)).toBeNull();
    expect(roundTrip("false")).toBeNull();
  });

  it("starts a row with the target's first operator and value", () => {
    expect(defaultRow(targets[0])).toEqual({ question: "role", operator: "is", args: ["a"] });
    expect(defaultRow(targets[4])).toEqual({ question: "battery", item: "tech", operator: "is", args: [1] });
    expect(rowsToScript({ match: "all", rows: [] }, targets)).toBe("true");
  });
});
