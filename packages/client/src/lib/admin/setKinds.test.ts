import { describe, expect, it } from "vitest";
import { isEmailColumn, isSpecialSet, SPECIAL_SET_INFO } from "./setKinds";

const column = (...names: string[]) => ({
  name: "coder",
  sets: names.map((name) => ({ name, unitIds: [1], ordered: false })),
});

describe("set kinds", () => {
  it("mark a column of email addresses, special sets aside", () => {
    expect(isEmailColumn(column("anna@uni.nl", "bob@uni.nl", "_overlap", "_gold"))).toBe(true);
    expect(isEmailColumn(column("anna@uni.nl", "bob"))).toBe(false);
    expect(isEmailColumn(column("_overlap"))).toBe(false);
  });

  it("explain each special set", () => {
    for (const name of ["_overlap", "_practice", "_gold"]) {
      expect(isSpecialSet(name)).toBe(true);
      expect(SPECIAL_SET_INFO[name]).toMatch(/^Special set:/);
    }
    expect(isSpecialSet("anna")).toBe(false);
  });
});
