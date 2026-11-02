import { describe, expect, it } from "vitest";
import type { AnyVariableType } from "./variableTypes.js";
import {
  ConditionSchema,
  applyHelper,
  evaluateSimpleCondition,
  parseSimpleCondition,
  printSimpleCondition,
} from "./condition.js";
import { buildScope } from "./references.js";

const questions = new Map<string, AnyVariableType>([
  ["role", { type: "nominal", question: "?", options: [{ value: "student" }, { value: "staff" }] }],
  ["topics", { type: "nominal", question: "?", multiple: true, options: [{ value: "x" }, { value: "y" }, { value: "z" }] }],
  ["edu", { type: "ordinal", question: "?", options: [{ value: 1, label: "low" }, { value: 2 }, { value: 3 }] }],
  ["age", { type: "numeric", question: "?", min: 0, max: 120 }],
  ["interest", { type: "scale", question: "?", items: [{ name: "tech" }, { name: "art" }], options: [{ value: 1 }, { value: 5 }] }],
  ["later", { type: "nominal", question: "?", options: [{ value: "a" }] }],
]);
const scope = buildScope(questions, {
  role: { done: true, skip: false, values: [{ value: "staff" }] },
  topics: { done: true, skip: false, values: [{ value: "x" }, { value: "y" }] },
  edu: { done: true, skip: false, values: [{ value: 2 }] },
  age: { done: true, skip: false, values: [{ value: 42 }] },
  interest: { done: true, skip: false, values: [{ item: "tech", value: 5 }] },
});
const holds = (script: string) => {
  const parsed = parseSimpleCondition(script);
  if (!parsed) throw new Error(`not simple: ${script}`);
  return evaluateSimpleCondition(parsed, scope);
};

describe("simple conditions", () => {
  it("evaluates helper calls", () => {
    expect(holds(`$var.role.is("staff")`)).toBe(true);
    expect(holds(`$var.role.isAny('student', "x")`)).toBe(false);
    expect(holds(`$var.topics.has("x") && $var.topics.hasAll("x", "y")`)).toBe(true);
    expect(holds(`$var.topics.hasAny("z")`)).toBe(false);
    expect(holds(`$var.topics.count() >= 2`)).toBe(true);
    expect(holds(`$var.edu.gte(2) && !$var.edu.gt(2)`)).toBe(true);
    expect(holds(`$var.age.between(18, 65) && $var.age.eq(42)`)).toBe(true);
    expect(holds(`$var.interest.items.tech.gte(4)`)).toBe(true);
    expect(holds(`$var.interest.items.art.lt(4)`)).toBe(false);
  });

  it("is false for unanswered questions", () => {
    expect(holds(`$var.later.is("a")`)).toBe(false);
    expect(holds(`!$var.later.answered`)).toBe(true);
    expect(holds(`$var.later.answered || $var.role.answered`)).toBe(true);
  });

  it("combines with precedence and parentheses", () => {
    expect(holds(`$var.role.is("student") && $var.edu.is(2) || true`)).toBe(true);
    expect(holds(`$var.role.is("student") && ($var.edu.is(2) || true)`)).toBe(false);
  });

  it("is null for anything else (an advanced script)", () => {
    for (const script of [
      "$var.role.value === 'x'",
      "$unit.x > 3",
      "$var.topics.count()",
      "$var.role.is(x)",
      "$var.role.is('a'",
      "$var.role.label",
      "",
    ]) {
      expect(parseSimpleCondition(script)).toBeNull();
    }
  });

  it("prints the canonical form", () => {
    const roundTrip = (s: string) => printSimpleCondition(parseSimpleCondition(s)!);
    expect(roundTrip(`$var.a.is( 'x' ) && ( $var.b.gte(3) || !$var.c.answered )`)).toBe(
      `$var.a.is("x") && ($var.b.gte(3) || !$var.c.answered)`,
    );
    expect(roundTrip(`!($var.a.is("x") || $var.b.count() > 1)`)).toBe(`!($var.a.is("x") || ($var.b.count() > 1))`);
    expect(roundTrip(`$var.q.items.tech.isAny(1, 2)`)).toBe(`$var.q.items.tech.isAny(1, 2)`);
  });
});

describe("applyHelper", () => {
  it("never compares across types", () => {
    expect(applyHelper({ value: 2 }, "is", ["2"])).toBe(false);
    expect(applyHelper({ value: "2" }, "gt", [1])).toBe(false);
    expect(applyHelper({ values: [] }, "hasAll", [])).toBe(false);
    expect(applyHelper(undefined, "count", [])).toBe(0);
  });
});

describe("ConditionSchema", () => {
  it("is a script", () => {
    expect(ConditionSchema.safeParse({ script: "true" }).success).toBe(true);
    expect(ConditionSchema.safeParse({ rules: [] }).success).toBe(false);
  });
});
