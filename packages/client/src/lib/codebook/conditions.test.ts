import { describe, expect, it } from "vitest";
import { applyHelper, buildScope, type AnyVariableType, type HelperMethod } from "@annotinder/contracts";
import { evaluateCondition } from "./conditions";
import { evaluateScript, scriptSyntaxError } from "./expression";

const questions = new Map<string, AnyVariableType>([
  ["role", { type: "categorical", question: "?", options: [{ value: "student" }, { value: "staff" }] }],
  ["topics", { type: "categorical", question: "?", multiple: true, options: [{ value: "a" }, { value: "b" }, { value: "c" }] }],
  ["edu", { type: "categorical", level: "ordinal", question: "?", options: [{ value: 1 }, { value: 2 }, { value: 3 }] }],
  ["age", { type: "numeric", question: "?" }],
  ["battery", { type: "scale", question: "?", items: [{ name: "x" }, { name: "y" }], options: [{ value: 1 }, { value: 5 }] }],
  ["later", { type: "categorical", question: "?", options: [{ value: "a" }] }],
]);
const scope = buildScope(
  questions,
  {
    role: { done: true, skip: false, values: [{ value: "student" }] },
    topics: { done: true, skip: false, values: [{ value: "a" }, { value: "b" }] },
    edu: { done: true, skip: false, values: [{ value: 2 }] },
    age: { done: true, skip: false, values: [{ value: 30 }] },
    battery: { done: true, skip: false, values: [{ item: "x", value: 5 }] },
  },
  { count: 20, source: "nyt" },
  { mode: "x" },
);

describe("evaluateCondition", () => {
  it("evaluates scripts over $unit, $var and $const", async () => {
    expect(await evaluateCondition({ script: "$unit.count >= 18 && $var.role.value === 'student'" }, scope)).toBe(true);
    expect(await evaluateCondition({ script: "$var.topics.values.includes('c')" }, scope)).toBe(false);
    expect(await evaluateCondition({ script: "$const.mode === 'x' // a comment" }, scope)).toBe(true);
  });

  it("evaluates simple conditions without a JS engine, and scripts with the same helpers", async () => {
    expect(await evaluateCondition({ script: `$var.topics.has("b") && !$var.later.answered` }, scope)).toBe(true);
    expect(await evaluateCondition({ script: `$var.topics.has("b") && $unit.count > 30` }, scope)).toBe(false);
    expect(await evaluateCondition({ script: `$var.edu.gte(2) ? $var.age.between(18, 40) : false` }, scope)).toBe(true);
  });

  it("has the same helpers in the sandbox as in TypeScript", async () => {
    const calls: [string, HelperMethod, unknown[]][] = [
      ["role", "is", ["student"]],
      ["role", "is", ["staff"]],
      ["role", "isAny", ["x", "student"]],
      ["later", "is", ["a"]],
      ["edu", "gt", [1]],
      ["edu", "lte", [1]],
      ["age", "eq", [30]],
      ["age", "between", [31, 40]],
      ["topics", "has", ["a"]],
      ["topics", "hasAny", ["c", "b"]],
      ["topics", "hasAll", ["a", "c"]],
      ["topics", "count", []],
      ["battery.items.x", "gte", [5]],
      ["battery.items.y", "lt", [5]],
    ];
    for (const [target, method, args] of calls) {
      const [q, , item] = target.split(".");
      const entry = item ? scope.$var[q].items![item] : scope.$var[q];
      const script = `$var.${target}.${method}(${args.map((a) => JSON.stringify(a)).join(", ")})`;
      expect([script, await evaluateScript(script, scope)]).toEqual([script, applyHelper(entry, method, args)]);
    }
  });

  it("has no bare-name globals", async () => {
    expect(await evaluateCondition({ script: "typeof role === 'undefined' && typeof count === 'undefined'" }, scope)).toBe(true);
  });

  it("returns false and does not throw on invalid scripts", async () => {
    expect(await evaluateCondition({ script: "this is not valid js (((" }, scope)).toBe(false);
  });

  it("is sandboxed from the host environment (no access to host globals)", async () => {
    expect(await evaluateCondition({ script: "typeof process === 'undefined'" }, scope)).toBe(true);
  });
});

describe("scriptSyntaxError", () => {
  it("reports syntax errors without running the script", async () => {
    expect(await scriptSyntaxError("$var.a.value === 'x'")).toBeNull();
    expect(await scriptSyntaxError("while (true) {}")).not.toBeNull();
    expect(await scriptSyntaxError("$var.a.value ===")).not.toBeNull();
  });
});
