import { describe, expect, it } from "vitest";

import { evaluateCondition } from "./conditions";

describe("evaluateCondition", () => {
  it("evaluates a simple comparison against known values", () => {
    expect(evaluateCondition("age >= 18", { age: 20 })).toBe(true);
    expect(evaluateCondition("age >= 18", { age: 10 })).toBe(false);
  });

  it("supports referencing multiple variables", () => {
    expect(evaluateCondition("consent === true && country === 'NL'", { consent: true, country: "NL" })).toBe(true);
    expect(evaluateCondition("consent === true && country === 'NL'", { consent: true, country: "BE" })).toBe(false);
  });

  it("ignores values whose names aren't valid identifiers", () => {
    // "123abc" can't be a function parameter name; it's silently excluded from scope.
    expect(evaluateCondition("true", { "123abc": "x" })).toBe(true);
  });

  it("returns false and does not throw on invalid expressions", () => {
    expect(evaluateCondition("this is not valid js (((", {})).toBe(false);
  });
});
