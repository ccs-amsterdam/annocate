import { describe, expect, it } from "vitest";
import type { SetGroupResponse } from "@annotinder/contracts";
import { isEmailColumn, roleLabel, TEST_UNIT_INFO } from "./setKinds";

const column = (name: SetGroupResponse["name"], ...names: string[]): SetGroupResponse => ({
  name,
  sets: names.map((n) => ({ name: n, unitIds: [1], ordered: false })),
});

describe("set kinds", () => {
  it("mark a column of email addresses", () => {
    expect(isEmailColumn(column("coder_set", "anna@uni.nl", "bob@uni.nl"))).toBe(true);
    expect(isEmailColumn(column("coder_set", "anna@uni.nl", "bob"))).toBe(false);
    expect(isEmailColumn(column("coder_set"))).toBe(false);
  });

  it("label the role columns and explain each test unit type", () => {
    expect(roleLabel("coder_set")).toBe("Coder set");
    expect(roleLabel("test_unit")).toBe("Test unit");
    expect(roleLabel("topic")).toBe("topic");
    for (const name of ["overlap", "practice", "gold"] as const) expect(TEST_UNIT_INFO[name]).toBeTruthy();
  });
});
