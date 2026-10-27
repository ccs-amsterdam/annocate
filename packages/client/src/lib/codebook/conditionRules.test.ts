import { describe, expect, it } from "vitest";
import { parseSimpleCondition, type AnyVariableType } from "@annotinder/contracts";
import { conditionToRows, defaultRow, rowProblems, rowsToScript, ruleTargets } from "./conditionRules";

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

  it("leaves nested conditions to the script editor", () => {
    expect(roundTrip(`$var.role.is("a") && ($var.age.gt(1) || $var.age.lt(0))`)).toBeNull();
    expect(roundTrip("false")).toBeNull();
  });

  it("keeps rows that don't fit their question, with their problems", () => {
    const problems = (script: string) => {
      const rows = conditionToRows(parseSimpleCondition(script)!, targets)!;
      return rows.rows.map((row) => rowProblems(row, targets));
    };
    // Written back unchanged.
    for (const script of [`$var.role.lt(16) && $var.role.is("c")`, `$var.other.is("a")`, `!$var.gone.answered`]) {
      expect(roundTrip(script)).toBe(script);
    }
    expect(problems(`$var.role.lt(16) && $var.role.is("c") && $var.role.is("a")`)).toEqual([
      [`"role" is a nominal question, which does not support "lower than" comparisons; use "is" or "is one of"`],
      [`"c" is not an answer option of "role" ("a", "b")`],
      [],
    ]);
    expect(problems(`$var.other.is("a")`)).toEqual([[`"other" is not a question asked before this point`]]);
    expect(problems(`$var.battery.items.art.is(1)`)).toEqual([[`"battery › art": "art" is not an item of "battery", a scale`]]);
    expect(problems(`$var.topics.count() > 1`)).toEqual([
      [`"topics": "count >" can't be edited as a rule; choose another, or edit the script`],
    ]);
  });

  it("starts a row with the target's first operator and value", () => {
    expect(defaultRow(targets[0])).toEqual({ question: "role", operator: "is", args: ["a"] });
    expect(defaultRow(targets[4])).toEqual({ question: "battery", item: "tech", operator: "is", args: [1] });
    expect(rowsToScript({ match: "all", rows: [] }, targets)).toBe("true");
  });
});
