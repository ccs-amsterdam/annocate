import { describe, expect, it } from "vitest";

import { evaluateCondition } from "./conditions";

describe("evaluateCondition", () => {
  it("evaluates a simple comparison against known values", async () => {
    expect(await evaluateCondition("age >= 18", { age: 20 })).toBe(true);
    expect(await evaluateCondition("age >= 18", { age: 10 })).toBe(false);
  });

  it("supports referencing multiple variables and real JS operators", async () => {
    expect(await evaluateCondition("consent === true && country === 'NL'", { consent: true, country: "NL" })).toBe(
      true,
    );
    expect(await evaluateCondition("consent === true && country === 'NL'", { consent: true, country: "BE" })).toBe(
      false,
    );
  });

  it("ignores values whose names aren't valid identifiers", async () => {
    // "123abc" can't be a `let` binding name; it's silently excluded from scope.
    expect(await evaluateCondition("true", { "123abc": "x" })).toBe(true);
  });

  it("returns false and does not throw on invalid expressions", async () => {
    expect(await evaluateCondition("this is not valid js (((", {})).toBe(false);
  });

  it("is sandboxed from the host environment (no access to host globals)", async () => {
    expect(await evaluateCondition("typeof process === 'undefined'", {})).toBe(true);
  });
});
