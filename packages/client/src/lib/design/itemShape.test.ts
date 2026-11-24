import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { carryKeys, designShapeError, itemsShapeError } from "./itemShape";

describe("item shape", () => {
  it("accepts lists of items the editor can show, checking children", () => {
    expect(itemsShapeError([{ name: "q", type: "question", variable: { type: "confirm" } }])).toBeNull();
    expect(itemsShapeError({})).toMatch(/list of items/);
    expect(
      itemsShapeError([{ type: "branch", condition: { script: "true" }, children: [{ name: "x", type: "question" }] }]),
    ).toBe(`'x': a question needs a "variable" with a "type"`);
    // Layout items, without a name
    expect(
      itemsShapeError([{ type: "unit_loop", units: {}, children: [{ type: "layout", template: "$unit.text" }] }]),
    ).toBeNull();
  });

  it("keeps the keys of items with the same name", () => {
    const before = [
      { _key: "k1", name: "a", type: "end" },
      { _key: "k2", name: "loop", type: "unit_loop", children: [{ _key: "k3", name: "b", type: "end" }] },
    ];
    const next = [
      {
        name: "loop",
        type: "unit_loop",
        children: [
          { name: "b", type: "end" },
          { name: "new", type: "end" },
        ],
      },
      { name: "a", type: "end" },
    ];
    const keyed = carryKeys(next as unknown as TopLevelItem[], before as unknown as TopLevelItem[]) as unknown as {
      _key?: string;
      children?: { _key?: string }[];
    }[];
    expect(keyed.map((i) => i._key)).toEqual(["k2", "k1"]);
    expect(keyed[0].children!.map((i) => i._key)).toEqual(["k3", undefined]);
  });

  it("keeps the keys of conditions at the same place", () => {
    const cond = (key: string | undefined, children: object[]) => ({
      ...(key ? { _key: key } : {}),
      type: "branch",
      condition: { script: "true" },
      children,
    });
    const before = [cond("c1", [cond("c2", [{ _key: "q", name: "q", type: "end" }])]), cond("c3", [])];
    const next = [
      cond(undefined, [cond(undefined, [{ name: "q", type: "end" }])]),
      { name: "x", type: "end" },
      cond(undefined, []),
      cond(undefined, []),
    ];
    const keyed = carryKeys(next as unknown as TopLevelItem[], before as unknown as TopLevelItem[]) as unknown as {
      _key?: string;
      children?: { _key?: string }[];
    }[];
    expect(keyed.map((i) => i._key)).toEqual(["c1", undefined, "c3", undefined]);
    expect(keyed[0].children!.map((i) => i._key)).toEqual(["c2"]);
  });

  it("keeps the keys of layouts at the same place in their loop", () => {
    const loop = (key: string | undefined, children: object[]) => ({
      ...(key ? { _key: key } : {}),
      type: "unit_loop",
      children,
    });
    const before = [
      loop("l1", [
        { _key: "y1", type: "layout", template: "a" },
        { _key: "q", name: "q", type: "end" },
        { _key: "y2", type: "layout", template: "b" },
      ]),
    ];
    const next = [
      loop(undefined, [
        { type: "layout", template: "a", style: { fontSize: "1.2em" } },
        { name: "q", type: "end" },
        { type: "layout", template: "b" },
        { type: "layout", template: "c" },
      ]),
    ];
    const keyed = carryKeys(next as unknown as TopLevelItem[], before as unknown as TopLevelItem[]) as unknown as {
      children: { _key?: string }[];
    }[];
    expect(keyed[0].children.map((i) => i._key)).toEqual(["y1", "q", "y2", undefined]);
  });

  it("keeps the keys of a branch's else items, which come as elseChildren", () => {
    const before = [
      {
        _key: "c1",
        type: "branch",
        condition: { script: "true" },
        children: [
          { _key: "a", name: "a", type: "end" },
          { _key: "e1", type: "else", children: [{ _key: "y1", type: "layout", template: "x" }] },
        ],
      },
    ];
    const next = [
      {
        type: "branch",
        condition: { script: "false" },
        children: [{ name: "a", type: "end" }],
        elseChildren: [{ type: "layout", template: "x" }],
      },
    ];
    const keyed = carryKeys(next as unknown as TopLevelItem[], before as unknown as TopLevelItem[]);
    expect(keyed).toEqual([
      {
        _key: "c1",
        type: "branch",
        condition: { script: "false" },
        children: [
          { _key: "a", name: "a", type: "end" },
          { _key: "e1", type: "else", children: [{ _key: "y1", type: "layout", template: "x" }] },
        ],
      },
    ]);
  });

  it("checks a branch's else items", () => {
    const branch = (elseChildren: unknown) => [
      { type: "branch", condition: { script: "true" }, children: [], elseChildren },
    ];
    expect(itemsShapeError(branch([{ name: "e", type: "end" }]))).toBeNull();
    expect(itemsShapeError(branch([{ name: "x", type: "question" }]))).toBe(
      `'x': a question needs a "variable" with a "type"`,
    );
    expect(itemsShapeError(branch({}))).toBe(`An item: "elseChildren" must be a list`);
  });

  it("doesn't ask conditions for a name", () => {
    expect(itemsShapeError([{ type: "branch", condition: { script: "true" }, children: [] }])).toBeNull();
  });
});

describe("designShapeError", () => {
  const question = { name: "q", type: "question", variable: { type: "confirm" } };
  it("takes a design with its session and public info apart from the items", () => {
    expect(designShapeError({ public: { title: "T" }, session: {}, items: [question] })).toBeNull();
    expect(designShapeError({ items: [] })).toBeNull();
    expect(designShapeError({ public: null, items: [question] })).toBeNull();
  });
  it("says what is wrong", () => {
    expect(designShapeError([question])).toMatch(/is an object/);
    expect(designShapeError({ items: [question], extra: 1 })).toMatch(/Unknown key "extra"/);
    expect(designShapeError({ items: [{ type: "session" }] })).toMatch(/goes in "session"/);
    expect(designShapeError({ session: [], items: [] })).toMatch(/"session" must be an object/);
  });
});
