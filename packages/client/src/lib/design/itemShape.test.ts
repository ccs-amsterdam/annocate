import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { carryKeys, designShapeError, itemsShapeError } from "./itemShape";

describe("item shape", () => {
  it("accepts lists of items the editor can show, checking children", () => {
    expect(itemsShapeError([{ name: "q", type: "question", variable: { type: "confirm" } }])).toBeNull();
    expect(itemsShapeError({})).toMatch(/list of items/);
    expect(itemsShapeError([{ type: "show_if", children: [{ name: "x", type: "question" }] }])).toBe(
      `'x': a question needs a "variable" with a "type"`,
    );
  });

  it("keeps the keys of items with the same name", () => {
    const before = [{ _key: "k1", name: "a", type: "end" }, { _key: "k2", name: "loop", type: "unit_loop", children: [{ _key: "k3", name: "b", type: "end" }] }];
    const next = [{ name: "loop", type: "unit_loop", children: [{ name: "b", type: "end" }, { name: "new", type: "end" }] }, { name: "a", type: "end" }];
    const keyed = carryKeys(next as unknown as TopLevelItem[], before as unknown as TopLevelItem[]) as unknown as { _key?: string; children?: { _key?: string }[] }[];
    expect(keyed.map((i) => i._key)).toEqual(["k2", "k1"]);
    expect(keyed[0].children!.map((i) => i._key)).toEqual(["k3", undefined]);
  });

  it("keeps the keys of conditions at the same place", () => {
    const cond = (key: string | undefined, children: object[]) => ({ ...(key ? { _key: key } : {}), type: "show_if", condition: { script: "true" }, children });
    const before = [cond("c1", [cond("c2", [{ _key: "q", name: "q", type: "end" }])]), cond("c3", [])];
    const next = [cond(undefined, [cond(undefined, [{ name: "q", type: "end" }])]), { name: "x", type: "end" }, cond(undefined, []), cond(undefined, [])];
    const keyed = carryKeys(next as unknown as TopLevelItem[], before as unknown as TopLevelItem[]) as unknown as { _key?: string; children?: { _key?: string }[] }[];
    expect(keyed.map((i) => i._key)).toEqual(["c1", undefined, "c3", undefined]);
    expect(keyed[0].children!.map((i) => i._key)).toEqual(["c2"]);
  });

  it("doesn't ask conditions for a name", () => {
    expect(itemsShapeError([{ type: "show_if", condition: { script: "true" }, children: [] }])).toBeNull();
  });
});

describe("designShapeError", () => {
  const question = { name: "q", type: "question", variable: { type: "confirm" } };
  it("takes a design with its session and public info apart from the items", () => {
    expect(designShapeError({ public: { title: "T" }, session: { params: [] }, items: [question] })).toBeNull();
    expect(designShapeError({ items: [] })).toBeNull();
    expect(designShapeError({ public: null, items: [question] })).toBeNull();
  });
  it("says what is wrong", () => {
    expect(designShapeError([question])).toMatch(/is an object/);
    expect(designShapeError({ items: [question], extra: 1 })).toMatch(/Unknown key "extra"/);
    expect(designShapeError({ items: [{ type: "session", params: [] }] })).toMatch(/goes in "session"/);
    expect(designShapeError({ session: [], items: [] })).toMatch(/"session" must be an object/);
  });
});
