import { describe, expect, it } from "vitest";
import type { SetGroupResponse } from "@annotinder/contracts";
import { assignWithoutValue, isEmailColumn, roleLabel, TEST_SET_INFO, unitsWithoutValue } from "./setKinds";

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

  it("label the role columns and explain each test set", () => {
    expect(roleLabel("coder_set")).toBe("Coder set");
    expect(roleLabel("test_set")).toBe("Test set");
    expect(roleLabel("topic")).toBe("topic");
    for (const name of ["overlap", "practice", "gold"] as const) expect(TEST_SET_INFO[name]).toBeTruthy();
  });
});

describe("assigning units without a value", () => {
  const set = (name: string, unitIds: number[], ordered = false) => ({ name, unitIds, ordered });
  const groups: SetGroupResponse[] = [
    { name: "coder_set", sets: [set("anna", [1, 2]), set("bob", [2, 3])] },
    { name: "part_set", sets: [set("pre", [1])] },
    { name: "test_set", sets: [set("gold", [4])] },
  ];
  const units = [1, 2, 3, 4, 5, 6, 7, 8];

  it("finds the units with no value that aren't test units", () => {
    expect(unitsWithoutValue(units, groups, "coder_set")).toEqual([5, 6, 7, 8]);
    expect(unitsWithoutValue(units, groups, "part_set")).toEqual([2, 3, 5, 6, 7, 8]);
    expect(unitsWithoutValue(units, groups, "condition_set")).toEqual([1, 2, 3, 5, 6, 7, 8]);
  });

  it("gives them to the coders, keeping what each has", () => {
    const sets = groups[0].sets;
    const one = assignWithoutValue("coder_set", sets, [5, 6, 7, 8], { seed: 1 });
    expect(one.map((s) => s.unitIds.slice(0, 2))).toEqual([
      [1, 2],
      [2, 3],
    ]);
    // One coder each, evenly; unit 1 (one coder) gets no second one
    expect(one.flatMap((s) => s.unitIds.slice(2)).sort()).toEqual([5, 6, 7, 8]);
    expect(one.map((s) => s.unitIds.length)).toEqual([4, 4]);
    const two = assignWithoutValue("coder_set", sets, [5, 6], { perUnit: 2, seed: 1 });
    expect(two.map((s) => s.unitIds)).toEqual([
      [1, 2, 5, 6],
      [2, 3, 5, 6],
    ]);
  });

  it("spreads them over a column's values, at the end of ordered sets", () => {
    const next = assignWithoutValue("part_set", [set("pre", [1], true), set("post", [9, 10])], [2, 3, 5], { seed: 2 });
    expect(next[0].unitIds[0]).toBe(1);
    expect(next[1].unitIds.slice(0, 2)).toEqual([9, 10]);
    expect(next.map((s) => s.unitIds.length)).toEqual([3, 3]);
    expect(next.flatMap((s) => s.unitIds).sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 9, 10]);
  });
});
