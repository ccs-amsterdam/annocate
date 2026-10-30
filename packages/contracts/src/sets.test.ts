import { describe, expect, it } from "vitest";
import { cellsFromSets, parseSetCell, setsFromCells, splitIntoSets } from "./sets.js";

describe("set cells", () => {
  it("read one set, several, and positions", () => {
    expect(parseSetCell("s1")).toEqual([{ set: "s1" }]);
    expect(parseSetCell(" s1 ; s2 ")).toEqual([{ set: "s1" }, { set: "s2" }]);
    expect(parseSetCell("s1#3;_overlap")).toEqual([{ set: "s1", position: 3 }, { set: "_overlap" }]);
    expect(parseSetCell("")).toEqual([]);
  });

  it("refuse reserved names, bad positions and a set twice", () => {
    expect(parseSetCell("_mine")).toMatchObject({ error: expect.stringContaining("reserved") });
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
  it("sets aside the overlap, then divides the rest evenly, reproducibly", () => {
    const ids = Array.from({ length: 11 }, (_, i) => i + 1);
    const sets = splitIntoSets(ids, { sets: 4, overlapUnits: 3 });
    expect(sets.map((s) => [s.name, s.units.length])).toEqual([
      ["s1", 2],
      ["s2", 2],
      ["s3", 2],
      ["s4", 2],
      ["_overlap", 3],
    ]);
    expect(new Set(sets.flatMap((s) => s.units)).size).toBe(11);
    expect(splitIntoSets(ids, { sets: 3, seed: 7 })).toEqual(splitIntoSets(ids, { sets: 3, seed: 7 }));
    expect(splitIntoSets(ids, { sets: 2, overlapFraction: 0.1, shuffle: false })).toMatchObject([{ units: [2, 3, 4, 5, 6] }, {}, { name: "_overlap", units: [1] }]);
  });
});
