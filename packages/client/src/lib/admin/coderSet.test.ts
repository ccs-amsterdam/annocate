import { describe, expect, it } from "vitest";
import type { SetGroupResponse } from "@annotinder/contracts";
import {
  codedBy,
  coderSetProblem,
  currentTestCounts,
  planCoderSet,
  preselectedCoders,
  unitsWithoutCoder,
  type CoderSetChoices,
  type CoderSetInput,
} from "./coderSet";

const set = (name: string, unitIds: number[]) => ({ name, unitIds, ordered: false });
const coderSet = (...sets: ReturnType<typeof set>[]): SetGroupResponse => ({ name: "coder_set", sets });
const testSet = (...sets: ReturnType<typeof set>[]): SetGroupResponse => ({ name: "test_set", sets });

const input = (groups: SetGroupResponse[] = [], coded: [string, number[]][] = []): CoderSetInput => ({
  unitIds: [1, 2, 3, 4, 5, 6],
  groups,
  coded: new Map(coded),
});
const choices = (extra: Partial<CoderSetChoices> = {}): CoderSetChoices => ({
  coders: ["anna", "bob"],
  mode: "anew",
  everyone: false,
  perUnit: 1,
  redistribute: false,
  testCounts: { overlap: 0, practice: 0, gold: 0 },
  keep: true,
  seed: 7,
  ...extra,
});
const unitsOf = (sets: { name: string; unitIds: number[] }[], name: string) =>
  [...(sets.find((s) => s.name === name)?.unitIds ?? [])].sort((a, b) => a - b);

describe("the coders the dialog starts with", () => {
  it("are the draft coder set's, of the study's expert coders", () => {
    const groups = [coderSet(set("anna", [1]), set("gone", [2]))];
    expect(preselectedCoders(["anna", "bob"], groups)).toEqual(["anna"]);
  });

  it("are all expert coders when there is no coder set yet", () => {
    expect(preselectedCoders(["anna", "bob"], [])).toEqual(["anna", "bob"]);
    expect(preselectedCoders(["anna", "bob"], [testSet(set("overlap", [1]))])).toEqual(["anna", "bob"]);
  });
});

describe("dividing the units anew", () => {
  it("gives every unit to one of the selected coders, about as many each", () => {
    const plan = planCoderSet(input(), choices());
    expect(plan.sets.map((s) => s.name)).toEqual(["anna", "bob"]);
    expect(plan.sets.map((s) => s.unitIds.length)).toEqual([3, 3]);
    expect(plan.sets.flatMap((s) => s.unitIds).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.testSets).toBeNull();
  });

  it("everyone codes everything, or each unit goes to several coders", () => {
    expect(planCoderSet(input(), choices({ everyone: true })).sets.map((s) => s.unitIds.length)).toEqual([6, 6]);
    const two = planCoderSet(input(), choices({ coders: ["anna", "bob", "carl"], perUnit: 2 }));
    expect(two.sets.map((s) => s.unitIds.length)).toEqual([4, 4, 4]);
  });

  it("leaves a coder who isn't selected out", () => {
    const groups = [coderSet(set("anna", [1, 2, 3]), set("bob", [4, 5, 6]))];
    expect(planCoderSet(input(groups), choices({ coders: ["anna"] })).sets.map((s) => s.name)).toEqual(["anna"]);
  });

  it("keeps the current test units out of the coders' units", () => {
    const groups = [testSet(set("overlap", [1, 2]))];
    const plan = planCoderSet(input(groups), choices());
    expect(plan.sets.flatMap((s) => s.unitIds).sort()).toEqual([3, 4, 5, 6]);
    expect(plan.testSets).toBeNull();
  });

  it("draws test units anew when asked: the test set is written again, or emptied", () => {
    const plan = planCoderSet(
      input(),
      choices({ redistribute: true, testCounts: { overlap: 2, practice: 1, gold: 0 } }),
    );
    expect(plan.testSets!.map((s) => [s.name, s.unitIds.length, s.ordered])).toEqual([
      ["overlap", 2, false],
      ["practice", 1, true],
    ]);
    expect(plan.sets.flatMap((s) => s.unitIds)).toHaveLength(3);
    expect(planCoderSet(input(), choices({ redistribute: true })).testSets).toEqual([]);
  });

  it("coders keep the units they coded, unless that is switched off", () => {
    const coded: [string, number[]][] = [["bob", [1, 2, 3, 4]]];
    expect(codedBy(input([], coded), ["anna", "bob"])).toEqual(new Map([["bob", [1, 2, 3, 4]]]));
    const kept = planCoderSet(input([], coded), choices());
    expect(unitsOf(kept.sets, "bob")).toEqual([1, 2, 3, 4]);
    expect(kept.kept).toBe(4);
    expect(planCoderSet(input([], coded), choices({ keep: false })).kept).toBe(0);
  });

  it("makes nothing without coders", () => {
    expect(planCoderSet(input(), choices({ coders: [] }))).toEqual({ sets: [], testSets: null, kept: 0 });
  });
});

describe("assigning the units without a coder", () => {
  // anna was deleted: units 1 to 3 have no coder; 6 is a test unit
  const groups = [coderSet(set("bob", [4, 5])), testSet(set("overlap", [6]))];

  it("finds the units no coder has and that aren't test units", () => {
    expect(unitsWithoutCoder(input(groups))).toEqual([1, 2, 3]);
    expect(unitsWithoutCoder(input())).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("gives them to the selected coders, those with the fewest units first; assignments stay", () => {
    const plan = planCoderSet(input(groups), choices({ mode: "empty", coders: ["bob", "carl"] }));
    expect(unitsOf(plan.sets, "bob")).toEqual(expect.arrayContaining([4, 5]));
    // bob has two already: carl gets two, and one of them the third
    expect(plan.sets.map((s) => [s.name, s.unitIds.length]).sort()).toEqual([
      ["bob", 3],
      ["carl", 2],
    ]);
    expect(plan.sets.flatMap((s) => s.unitIds).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(plan.testSets).toBeNull();
  });

  it("a coder who isn't selected keeps their units and gets none", () => {
    const plan = planCoderSet(input(groups), choices({ mode: "empty", coders: ["carl"] }));
    expect(unitsOf(plan.sets, "bob")).toEqual([4, 5]);
    expect(unitsOf(plan.sets, "carl")).toEqual([1, 2, 3]);
  });

  it("without a coder set yet, the units are divided anew", () => {
    const plan = planCoderSet(input(), choices({ mode: "empty" }));
    expect(plan.sets.flatMap((s) => s.unitIds)).toHaveLength(6);
  });
});

describe("what keeps the coder set from being made", () => {
  it("no coder selected, or no units", () => {
    expect(coderSetProblem(input(), choices({ coders: [] }))).toBe("Select at least one coder.");
    expect(coderSetProblem({ ...input(), unitIds: [] }, choices())).toBe(
      "The study has no units yet: upload them first.",
    );
    expect(coderSetProblem(input(), choices())).toBeNull();
  });

  it("nothing to assign, or test units that leave no unit for the coders", () => {
    const full = [coderSet(set("anna", [1, 2, 3, 4, 5, 6]))];
    expect(coderSetProblem(input(full), choices({ mode: "empty" }))).toBe("Every unit has a coder or is a test unit.");
    expect(
      coderSetProblem(input(), choices({ redistribute: true, testCounts: { overlap: 3, practice: 2, gold: 1 } })),
    ).toBe("There are 6 units: leave some for the coders.");
    // The counts only matter when the test units are drawn anew
    expect(coderSetProblem(input(), choices({ testCounts: { overlap: 6, practice: 0, gold: 0 } }))).toBeNull();
  });
});

describe("the test units there are", () => {
  it("are counted per type", () => {
    expect(currentTestCounts([testSet(set("overlap", [1, 2]), set("gold", [3]))])).toEqual({
      overlap: 2,
      practice: 0,
      gold: 1,
    });
    expect(currentTestCounts([])).toEqual({ overlap: 0, practice: 0, gold: 0 });
  });
});
