import { describe, expect, it } from "vitest";
import type { AnyVariableType } from "./answers.js";
import { ConditionSchema, evaluateRules, rulesToScript, type ConditionRule } from "./condition.js";
import { buildScope } from "./references.js";

const questions = new Map<string, AnyVariableType>([
  ["role", { type: "select_code", question: "?", codes: [{ code: "a", value: 1 }, { code: "b", value: 2 }] }],
  ["topics", { type: "select_code", question: "?", multiple: true, codes: [{ code: "x" }, { code: "y" }, { code: "z" }] }],
  ["later", { type: "select_code", question: "?", codes: [{ code: "a" }] }],
]);
const scope = buildScope(
  questions,
  {
    role: { done: true, skip: false, codes: [{ code: "b" }] },
    topics: { done: true, skip: false, codes: [{ code: "x" }, { code: "y" }] },
  },
  { count: 42, source: "nyt" },
);
const holds = (rule: Omit<ConditionRule, "op"> & { op: string }) => evaluateRules({ rules: [rule as ConditionRule] }, scope);

describe("evaluateRules", () => {
  it("compares scalars", () => {
    expect(holds({ ref: "$var.role.code", op: "is", value: "b" })).toBe(true);
    expect(holds({ ref: "$var.role.code", op: "isnot", value: "b" })).toBe(false);
    expect(holds({ ref: "$unit.source", op: "is", value: "nyt" })).toBe(true);
  });

  it("treats arrays with is/isnot as any of / none of", () => {
    expect(holds({ ref: "$var.role.code", op: "is", value: ["a", "b"] })).toBe(true);
    expect(holds({ ref: "$var.role.code", op: "isnot", value: ["a", "b"] })).toBe(false);
  });

  it("treats array refs as contains", () => {
    expect(holds({ ref: "$var.topics.code", op: "is", value: "x" })).toBe(true);
    expect(holds({ ref: "$var.topics.code", op: "is", value: "z" })).toBe(false);
    expect(holds({ ref: "$var.topics.code", op: "is", value: ["z", "y"] })).toBe(true);
    expect(holds({ ref: "$var.topics.code", op: "isnot", value: "z" })).toBe(true);
  });

  it("compares numbers", () => {
    expect(holds({ ref: "$var.role.value", op: "gte", value: 2 })).toBe(true);
    expect(holds({ ref: "$var.role.value", op: "gt", value: 2 })).toBe(false);
    expect(holds({ ref: "$unit.count", op: "lt", value: 50 })).toBe(true);
    expect(holds({ ref: "$unit.count", op: "lte", value: 41 })).toBe(false);
    expect(holds({ ref: "$var.topics.code", op: "gt", value: 1 })).toBe(false);
  });

  it("treats unanswered questions as empty", () => {
    expect(holds({ ref: "$var.later.code", op: "is", value: "a" })).toBe(false);
    expect(holds({ ref: "$var.later.code", op: "isnot", value: "a" })).toBe(true);
    expect(holds({ ref: "$var.later.value", op: "lt", value: 10 })).toBe(false);
    expect(holds({ ref: "$var.later.answered", op: "is", value: false })).toBe(true);
  });

  it("combines rules with all (default) or any", () => {
    const rules: ConditionRule[] = [
      { ref: "$var.role.code", op: "is", value: "a" },
      { ref: "$unit.count", op: "gt", value: 40 },
    ];
    expect(evaluateRules({ rules }, scope)).toBe(false);
    expect(evaluateRules({ match: "any", rules }, scope)).toBe(true);
    expect(evaluateRules({ rules: [] }, scope)).toBe(true);
  });
});

describe("ConditionSchema", () => {
  it("accepts rules or a script, not both", () => {
    expect(ConditionSchema.safeParse({ rules: [] }).success).toBe(true);
    expect(ConditionSchema.safeParse({ script: "true" }).success).toBe(true);
    expect(ConditionSchema.safeParse({ script: "true", rules: [] }).success).toBe(false);
    expect(ConditionSchema.safeParse({ rules: [{ ref: "$var.a.code", op: "like", value: "x" }] }).success).toBe(false);
  });
});

describe("rulesToScript", () => {
  it("writes the equivalent script", () => {
    const isArray = (ref: string) => ref === "$var.topics.code";
    expect(
      rulesToScript(
        {
          match: "any",
          rules: [
            { ref: "$var.role.code", op: "is", value: "a" },
            { ref: "$var.role.code", op: "isnot", value: ["a", "b"] },
            { ref: "$var.topics.code", op: "is", value: ["x", "y"] },
            { ref: "$var.role.value", op: "gte", value: 2 },
          ],
        },
        isArray,
      ),
    ).toBe(
      `($var.role.code === "a") || (!["a","b"].includes($var.role.code)) || (["x","y"].some((v) => $var.topics.code.includes(v))) || ($var.role.value >= 2)`,
    );
    expect(rulesToScript({ rules: [] })).toBe("true");
  });
});
