import { describe, expect, it } from "vitest";
import { forEachItem, itemLists, type ItemPath } from "./walk.js";

describe("forEachItem", () => {
  const items = [
    { type: "question", name: "a" },
    null,
    "junk",
    {
      type: "block",
      children: [{ type: "question", name: "b" }],
      elseChildren: [{ type: "end", name: "c", children: [{ type: "question", name: "hidden" }] }],
    },
    { type: "unit_loop", children: [{ type: "question", name: "d" }] },
  ];

  it("visits every object item in document order, with its path, children before else items", () => {
    const seen: [unknown, ItemPath][] = [];
    forEachItem<{ name?: string; type?: string }>(items, (item, path) => {
      seen.push([item.name ?? item.type, path]);
    });
    expect(seen).toEqual([
      ["a", [0]],
      ["block", [3]],
      ["b", [3, "children", 0]],
      ["c", [3, "elseChildren", 0]],
      ["hidden", [3, "elseChildren", 0, "children", 0]],
      ["unit_loop", [4]],
      ["d", [4, "children", 0]],
    ]);
  });

  it("doesn't go into an item the visitor skips, and starts paths below the given path", () => {
    const names: string[] = [];
    const paths: ItemPath[] = [];
    forEachItem<{ name?: string; type?: string }>(
      items,
      (item, path) => {
        if (item.name) names.push(item.name);
        paths.push(path);
        if (item.type !== "block") return "skip";
      },
      ["root"],
    );
    expect(names).toEqual(["a", "b", "c"]);
    expect(paths[0]).toEqual(["root", 0]);
  });

  it("tolerates raw input", () => {
    const visit = () => {
      throw new Error("visited");
    };
    for (const list of [undefined, null, 3, "x", {}, [null, 1, "x"]])
      expect(() => forEachItem(list, visit)).not.toThrow();
  });
});

describe("itemLists", () => {
  it("gives the children and else items that are arrays", () => {
    expect(itemLists({ children: [1], elseChildren: [2] })).toEqual([
      { key: "children", list: [1] },
      { key: "elseChildren", list: [2] },
    ]);
    expect(itemLists({ children: "no" })).toEqual([]);
    expect(itemLists(null)).toEqual([]);
  });
});
