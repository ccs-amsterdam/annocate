import { describe, expect, it } from "vitest";
import type { ReferenceScope } from "@annotinder/contracts";
import { evaluateCondition } from "./conditions";
import { scriptSyntaxError } from "./expression";

const scope: ReferenceScope = {
  $unit: { count: 20, source: "nyt" },
  $var: {
    role: { answered: true, code: "student", value: 1 },
    topics: { answered: true, code: ["a", "b"], value: [] },
  },
  $const: { mode: "x" },
};

describe("evaluateCondition", () => {
  it("evaluates scripts over $unit, $var and $const", async () => {
    expect(await evaluateCondition({ script: "$unit.count >= 18 && $var.role.code === 'student'" }, scope)).toBe(true);
    expect(await evaluateCondition({ script: "$var.topics.code.includes('c')" }, scope)).toBe(false);
    expect(await evaluateCondition({ script: "$const.mode === 'x' // a comment" }, scope)).toBe(true);
  });

  it("evaluates rules without a JS engine", async () => {
    expect(await evaluateCondition({ rules: [{ ref: "$var.topics.code", op: "is", value: "b" }] }, scope)).toBe(true);
    expect(await evaluateCondition({ match: "any", rules: [{ ref: "$unit.count", op: "lt", value: 10 }] }, scope)).toBe(false);
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
    expect(await scriptSyntaxError("$var.a.code === 'x'")).toBeNull();
    expect(await scriptSyntaxError("while (true) {}")).not.toBeNull();
    expect(await scriptSyntaxError("$var.a.code ===")).not.toBeNull();
  });
});
