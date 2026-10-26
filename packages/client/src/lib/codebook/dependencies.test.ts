import { describe, expect, it } from "vitest";
import type { ReferenceScope } from "@annotinder/contracts";
import { extractDependencies } from "./dependencies";

const scope: ReferenceScope = {
  $unit: { text: "hi", n: 3 },
  $var: { role: { answered: true, code: "a", value: 1 } },
  $const: {},
};

describe("extractDependencies", () => {
  it("reads the values at the referenced paths", () => {
    expect(extractDependencies("$unit.n > 2 && $var.role.code === 'a'", scope)).toEqual({
      "$unit.n": 3,
      "$var.role.code": "a",
    });
  });

  it("ignores references in strings and comments", () => {
    expect(extractDependencies("'$unit.text' // $var.role.code", scope)).toEqual({});
  });

  it("returns null for computed references (not cacheable)", () => {
    expect(extractDependencies("$unit[name]", scope)).toBeNull();
  });
});
