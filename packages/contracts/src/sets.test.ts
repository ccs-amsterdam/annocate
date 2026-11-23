import { describe, expect, it } from "vitest";
import {
  addToSets,
  cellsFromSets,
  parseSetCell,
  roleColumnProblem,
  setsFromCells,
  splitIntoSets,
  distributeUnits,
} from "./sets.js";

describe("set cells", () => {
  it("read one set, several, and positions", () => {
    expect(parseSetCell("s1")).toEqual([{ set: "s1" }]);
    expect(parseSetCell(" s1 ; s2 ")).toEqual([{ set: "s1" }, { set: "s2" }]);
    expect(parseSetCell("s1#3;pre")).toEqual([{ set: "s1", position: 3 }, { set: "pre" }]);
    expect(parseSetCell("")).toEqual([]);
  });

  it("refuse bad names, bad positions and a set twice", () => {
    expect(parseSetCell("a b ")).toEqual([{ set: "a b" }]);
    expect(parseSetCell("s1#0")).toMatchObject({ error: expect.stringContaining("position") });
    expect(parseSetCell("s1;s1")).toMatchObject({ error: expect.stringContaining("twice") });
  });

  it("make sets from a column and back: unordered in the units' order, ordered by position", () => {
    const sets = setsFromCells([
      { unitId: 1, cell: "a" },
      { unitId: 2, cell: "a;b#2" },
      { unitId: 3, cell: "b#1" },
      { unitId: 4, cell: "" },
    ]);
    expect(sets).toEqual([
      { name: "a", unitIds: [1, 2], ordered: false },
      { name: "b", unitIds: [3, 2], ordered: true },
    ]);
    expect(cellsFromSets(sets as never)).toEqual(
      new Map([
        [1, "a"],
        [2, "a;b#2"],
        [3, "b#1"],
      ]),
    );
  });
});

describe("splitIntoSets", () => {
  it("divides the units evenly, reproducibly", () => {
    const ids = Array.from({ length: 11 }, (_, i) => i + 1);
    const sets = splitIntoSets(ids, { sets: 4 });
    expect(sets.map((s) => [s.name, s.units.length])).toEqual([
      ["s1", 3],
      ["s2", 3],
      ["s3", 3],
      ["s4", 2],
    ]);
    expect(new Set(sets.flatMap((s) => s.units)).size).toBe(11);
    expect(splitIntoSets(ids, { sets: 3, seed: 7 })).toEqual(splitIntoSets(ids, { sets: 3, seed: 7 }));
    expect(splitIntoSets(ids, { sets: 2, shuffle: false, prefix: "part" })).toMatchObject([
      { name: "part1", units: [1, 2, 3, 4, 5, 6] },
      { name: "part2" },
    ]);
  });

  it("gives each unit to several sets: coders per unit", () => {
    const ids = Array.from({ length: 6 }, (_, i) => i + 1);
    const sets = splitIntoSets(ids, { sets: 3, perUnit: 2, shuffle: false });
    expect(sets.map((s) => s.units)).toEqual([
      [1, 3, 4, 6],
      [1, 2, 4, 5],
      [2, 3, 5, 6],
    ]);
  });
});

describe("addToSets", () => {
  const sets = [
    { name: "s1", unitIds: [1, 2, 3], ordered: false },
    { name: "s2", unitIds: [4, 5], ordered: false },
    { name: "s3", unitIds: [6], ordered: false },
  ];
  it("distributes new units over the existing sets, smallest first", () => {
    const next = addToSets(sets, [7, 8, 9], "distribute");
    expect(next.map((s) => s.unitIds.length)).toEqual([3, 3, 3]);
    expect(new Set(next.flatMap((s) => s.unitIds))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });
  it("makes new sets the average size, named on", () => {
    const next = addToSets(sets, [10, 11, 12, 13, 14, 15], "new");
    expect(next.map((s) => [s.name, s.unitIds.length])).toEqual([
      ["s1", 3],
      ["s2", 2],
      ["s3", 1],
      // average 2: three new sets of 2
      ["s4", 2],
      ["s5", 2],
      ["s6", 2],
    ]);
  });
});

describe("distributeUnits", () => {
  it("draws test units per type first, then divides the rest; everyone codes everything", () => {
    const units = Array.from({ length: 20 }, (_, i) => i + 1);
    const { sets, testUnits } = distributeUnits(units, ["a", "b"], {
      newTestUnits: { practice: 2, gold: 2, overlap: 3 },
      seed: 4,
    });
    const of = (name: string) => testUnits.find((s) => s.name === name)!.units;
    expect(testUnits.map((t) => t.name)).toEqual(["overlap", "practice", "gold"]);
    expect([of("practice").length, of("gold").length, of("overlap").length]).toEqual([2, 2, 3]);
    const tests = new Set(testUnits.flatMap((t) => t.units));
    expect(tests.size).toBe(7);
    expect(sets.flatMap((s) => s.units).sort((x, y) => x - y)).toEqual(units.filter((u) => !tests.has(u)));
    // As many coders per unit as coders: everyone codes everything
    const all = distributeUnits(units, ["a", "b"], { perUnit: 2 }).sets;
    expect(all.map((s) => s.units.length)).toEqual([20, 20]);
  });

  it("leaves existing test units out, drawing none", () => {
    const units = Array.from({ length: 10 }, (_, i) => i + 1);
    const { sets, testUnits } = distributeUnits(units, ["a", "b"], { testUnits: [1, 2, 3] });
    expect(testUnits).toEqual([]);
    expect(sets.flatMap((s) => s.units).sort((x, y) => x - y)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  const units = Array.from({ length: 12 }, (_, i) => i + 1);
  const sizes = (sets: { name: string; units: number[] }[]) => sets.map((s) => s.units.length);

  it("gives every unit to perUnit coders, evenly; overlap units are no coder's own", () => {
    const { sets, testUnits } = distributeUnits(units, ["a", "b", "c"], { perUnit: 2, newTestUnits: { overlap: 3 } });
    expect(sets.map((s) => s.name)).toEqual(["a", "b", "c"]);
    expect(testUnits[0].units).toHaveLength(3);
    expect(sizes(sets)).toEqual([6, 6, 6]);
    const count = new Map<number, number>();
    for (const s of sets) for (const u of s.units) count.set(u, (count.get(u) ?? 0) + 1);
    expect([...count.values()].every((n) => n === 2)).toBe(true);
  });

  it("keeps the units coders already have, then fills up the rest", () => {
    const keep = new Map([
      ["a", [1, 2, 3, 4]],
      ["gone", [5]],
    ]);
    const { sets, kept } = distributeUnits(units, ["a", "b", "c"], { seed: 1, keep });
    expect(kept).toBe(4);
    expect(sets[0].units).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    // One coder per unit: every unit once, about evenly
    expect(sizes(sets).reduce((x, y) => x + y, 0)).toBe(12);
    expect(Math.max(...sizes(sets)) - Math.min(...sizes(sets))).toBeLessThanOrEqual(1);
  });
});

describe("roleColumnProblem", () => {
  it("takes only the test sets in test_set, one per unit; set columns any values", () => {
    const set = (name: string, unitIds: number[]) => ({ name, unitIds, ordered: false });
    expect(roleColumnProblem("test_set", [set("practice", [1, 2]), set("gold", [3])])).toBeNull();
    expect(roleColumnProblem("test_set", [set("_gold", [1])])).toContain("not a test set");
    expect(roleColumnProblem("test_set", [set("practice", [1]), set("gold", [1])])).toContain("one test set at most");
    expect(roleColumnProblem("part_set", [set("pre", [1]), set("post", [1])])).toBeNull();
  });
});
