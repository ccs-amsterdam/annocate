import { describe, expect, it } from "vitest";
import { coderCounts, renameCoder, setToCode, spreadUnits, unassignedUnits, type CoderWork } from "./moveUnits";

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

  it("finds the units no coder has, test units aside", () => {
    expect(unassignedUnits([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], sets, [11])).toEqual([12, 13]);
  });

  it("gives a coder fewer units: the ones never sent go first, the coded ones stay", () => {
    const fewer = setToCode(sets, "a", 1, work, []);
    expect(fewer.find((s) => s.name === "a")!.unitIds).toEqual([1, 2, 3]);
    // To zero: only the coded units are left
    expect(setToCode(sets, "a", 0, work, []).find((s) => s.name === "a")!.unitIds).toEqual([1, 2]);
  });

  it("gives a coder more units from the unassigned ones, as many as there are", () => {
    const more = setToCode(sets, "b", 5, work, [12, 13, 7]);
    // 7 is theirs already
    expect(more.find((s) => s.name === "b")!.unitIds).toEqual([6, 7, 12, 13]);
  });

  it("renames a coder", () => {
    expect(renameCoder(sets, "b", "bea").map((s) => s.name)).toEqual(["a", "bea", "c"]);
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
