import { describe, expect, it } from "vitest";
import { coderCounts, moveUnits, spreadUnits, type CoderWork } from "./moveUnits";

const set = (name: string, unitIds: number[]) => ({ name, unitIds, ordered: false });
const work: CoderWork = new Map([
  ["a", { coded: new Set([1, 2]), served: new Set([3]) }],
  ["c", { coded: new Set([9]), served: new Set() }],
]);
const sets = [set("a", [1, 2, 3, 4, 5]), set("b", [6, 7]), set("c", [8, 9, 10])];

describe("moving units between coders", () => {
  it("counts what each coder coded and has left", () => {
    expect(coderCounts(sets, work)).toEqual([
      { coder: "a", units: 5, coded: 2, toCode: 3 },
      { coder: "b", units: 2, coded: 0, toCode: 2 },
      { coder: "c", units: 3, coded: 1, toCode: 2 },
    ]);
  });

  it("moves units the coder didn't code, never sent and last in the list first", () => {
    const { sets: next, moved } = moveUnits(sets, "a", "b", 2, work);
    expect(moved).toBe(2);
    expect(next.find((s) => s.name === "a")!.unitIds).toEqual([1, 2, 3]);
    expect(next.find((s) => s.name === "b")!.unitIds).toEqual([6, 7, 5, 4]);
    // Then the unit they were sent; never the coded ones
    expect(moveUnits(sets, "a", "b", 10, work).moved).toBe(3);
  });

  it("skips units the other coder has already", () => {
    const shared = [set("a", [1, 3, 4]), set("b", [4])];
    expect(moveUnits(shared, "a", "b", 5, work).sets).toEqual([set("a", [1, 4]), set("b", [4, 3])]);
  });

  it("hands out a coder's uncoded units to whoever has the fewest left; the coded ones stay", () => {
    const { sets: next, moved } = spreadUnits(sets, "c", work);
    expect(moved).toBe(2);
    expect(next.find((s) => s.name === "c")!.unitIds).toEqual([9]);
    expect(next.find((s) => s.name === "b")!.unitIds).toHaveLength(3);
    expect(next.find((s) => s.name === "a")!.unitIds).toHaveLength(6);
    // Without coded units, the coder leaves the coder set
    const { sets: without } = spreadUnits(sets, "b", work);
    expect(without.map((s) => s.name)).toEqual(["a", "c"]);
    expect(without.flatMap((s) => s.unitIds).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
