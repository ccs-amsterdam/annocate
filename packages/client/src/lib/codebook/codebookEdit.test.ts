import { describe, it, expect } from "vitest";
import type { CodebookItem } from "@annotinder/contracts";
import { deleteItem, insertItem, moveItem, nextChildPosition } from "./codebookEdit";
import { sortByPosition } from "./tree";

function cond(position: string, name: string): CodebookItem {
  return { type: "condition", position, name, expression: "true" };
}

function positions(items: CodebookItem[]): string[] {
  return sortByPosition(items).map((i) => i.position);
}

describe("nextChildPosition", () => {
  it("returns the next root position when parent is null", () => {
    const items = [cond("1", "a"), cond("2", "b")];
    expect(nextChildPosition(items, null)).toBe("3");
  });

  it("returns the next child position under a parent", () => {
    const items = [cond("1", "a"), cond("1.1", "b")];
    expect(nextChildPosition(items, "1")).toBe("1.2");
  });

  it("returns '1'/'parent.1' for a childless parent", () => {
    expect(nextChildPosition([], null)).toBe("1");
    expect(nextChildPosition([cond("1", "a")], "1")).toBe("1.1");
  });
});

describe("insertItem", () => {
  it("appends a new last root item", () => {
    const items = [cond("1", "a")];
    const next = insertItem(items, { type: "condition", name: "b", expression: "true" }, null);
    expect(positions(next)).toEqual(["1", "2"]);
  });

  it("appends a new last child", () => {
    const items = [cond("1", "a"), cond("1.1", "b")];
    const next = insertItem(items, { type: "condition", name: "c", expression: "true" }, "1");
    expect(positions(next)).toEqual(["1", "1.1", "1.2"]);
  });
});

describe("deleteItem", () => {
  it("removes an item and closes the gap among siblings", () => {
    const items = [cond("1", "a"), cond("2", "b"), cond("3", "c")];
    const next = deleteItem(items, "2");
    expect(positions(next)).toEqual(["1", "2"]);
    expect(sortByPosition(next).map((i) => i.name)).toEqual(["a", "c"]);
  });

  it("removes all descendants along with the item", () => {
    const items = [cond("1", "a"), cond("1.1", "b"), cond("1.1.1", "c"), cond("2", "d")];
    const next = deleteItem(items, "1");
    expect(positions(next)).toEqual(["1"]);
    expect(sortByPosition(next).map((i) => i.name)).toEqual(["d"]);
  });

  it("renumbers deeper descendants correctly after a mid-tree delete", () => {
    const items = [cond("1", "a"), cond("1.1", "b"), cond("1.2", "c"), cond("1.2.1", "d")];
    const next = deleteItem(items, "1.1");
    expect(positions(next)).toEqual(["1", "1.1", "1.1.1"]);
    const byName = Object.fromEntries(next.map((i) => [i.name, i.position]));
    expect(byName).toEqual({ a: "1", c: "1.1", d: "1.1.1" });
  });
});

describe("moveItem", () => {
  it("reorders within the same sibling group (move later)", () => {
    const items = [cond("1", "a"), cond("2", "b"), cond("3", "c")];
    const next = moveItem(items, "1", null, 2);
    const byName = Object.fromEntries(next.map((i) => [i.name, i.position]));
    expect(byName).toEqual({ b: "1", c: "2", a: "3" });
  });

  it("reorders within the same sibling group (move earlier)", () => {
    const items = [cond("1", "a"), cond("2", "b"), cond("3", "c")];
    const next = moveItem(items, "3", null, 0);
    const byName = Object.fromEntries(next.map((i) => [i.name, i.position]));
    expect(byName).toEqual({ c: "1", a: "2", b: "3" });
  });

  it("moves an item (with descendants) to a new parent", () => {
    const items = [cond("1", "a"), cond("1.1", "a-child"), cond("2", "b"), cond("2.1", "b-child")];
    const next = moveItem(items, "1", "2", 0);
    const byName = Object.fromEntries(next.map((i) => [i.name, i.position]));
    // "a" and its child move under "2" (now renumbered to "1" since "a" is removed from root)
    expect(byName.a.startsWith(`${byName.b}.`)).toBe(true);
    expect(byName["a-child"].startsWith(`${byName.a}.`)).toBe(true);
    expect(byName["b-child"]).not.toBe(byName.a);
  });

  it("moves an item to root level", () => {
    const items = [cond("1", "a"), cond("1.1", "b"), cond("1.2", "c")];
    const next = moveItem(items, "1.1", null, 1);
    const byName = Object.fromEntries(next.map((i) => [i.name, i.position]));
    expect(byName).toEqual({ a: "1", c: "1.1", b: "2" });
  });

  it("refuses to move an item into its own subtree", () => {
    const items = [cond("1", "a"), cond("1.1", "b")];
    const next = moveItem(items, "1", "1.1", 0);
    expect(positions(next)).toEqual(positions(items));
  });

  it("preserves all items (no duplicates/losses) across a move", () => {
    const items = [
      cond("1", "a"),
      cond("1.1", "a1"),
      cond("1.2", "a2"),
      cond("2", "b"),
      cond("3", "c"),
      cond("3.1", "c1"),
    ];
    const next = moveItem(items, "2", "3", 1);
    expect(next).toHaveLength(items.length);
    const names = next.map((i) => i.name).sort();
    expect(names).toEqual(["a", "a1", "a2", "b", "c", "c1"].sort());
    // All positions must be unique.
    expect(new Set(next.map((i) => i.position)).size).toBe(items.length);
  });
});
