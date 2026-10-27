import { describe, expect, it } from "vitest";
import type { ReferenceScope } from "@annotinder/contracts";
import { extractDependencies } from "./dependencies";

const scope: ReferenceScope = {
  $unit: { text: "hi", n: 3 },
  $var: { role: { answered: true, value: "a", label: "A" } },
};

describe("extractDependencies", () => {
  it("reads the values at the referenced paths", () => {
    expect(extractDependencies("$unit.n > 2 && $var.role.value === 'a'", scope)).toEqual({
      "$unit.n": 3,
      "$var.role.value": "a",
    });
  });

  it("makes a helper call depend on its question", () => {
    expect(extractDependencies(`$var.role.is("a")`, scope)).toEqual({ "$var.role": { answered: true, value: "a", label: "A" } });
  });

  it("ignores references in strings and comments", () => {
    expect(extractDependencies("'$unit.text' // $var.role.value", scope)).toEqual({});
  });

  it("returns null for computed references (not cacheable)", () => {
    expect(extractDependencies("$unit[name]", scope)).toBeNull();
  });
});
