import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { carryKeys, itemsShapeError } from "./itemShape";

describe("item shape", () => {
  it("accepts lists of items the editor can show, checking children", () => {
    expect(itemsShapeError([{ name: "q", type: "question", variable: { type: "confirm" } }])).toBeNull();
    expect(itemsShapeError({})).toMatch(/list of items/);
    expect(itemsShapeError([{ name: "c", type: "condition", children: [{ name: "x", type: "question" }] }])).toBe(
      `'x': a question needs a "variable" with a "type"`,
    );
  });

  it("keeps the keys of items with the same name", () => {
    const before = [{ _key: "k1", name: "a", type: "end" }, { _key: "k2", name: "loop", type: "condition", children: [{ _key: "k3", name: "b", type: "end" }] }];
    const next = [{ name: "loop", type: "condition", children: [{ name: "b", type: "end" }, { name: "new", type: "end" }] }, { name: "a", type: "end" }];
    const keyed = carryKeys(next as unknown as TopLevelItem[], before as unknown as TopLevelItem[]) as unknown as { _key?: string; children?: { _key?: string }[] }[];
    expect(keyed.map((i) => i._key)).toEqual(["k2", "k1"]);
    expect(keyed[0].children!.map((i) => i._key)).toEqual(["k3", undefined]);
  });
});
