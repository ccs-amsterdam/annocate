import { describe, it, expect } from "vitest";
import type { TopLevelItem, CodebookItem } from "@annotinder/contracts";
import {
  canMoveItemTo,
  deleteItem,
  indentItem,
  insertItem,
  moveItem,
  moveItemTo,
  outdentItem,
  updateItem,
} from "./codebookEdit";
import { flattenTree } from "./tree";

function cond(name: string, children: CodebookItem[] = []): TopLevelItem {
  return { type: "condition", name, expression: "true", children: children as TopLevelItem[] };
}

describe("codebookEdit", () => {
  describe("insertItem", () => {
    it("appends a new root item when parent is null", () => {
      const items: TopLevelItem[] = [cond("a")];
      const next = insertItem(items, null, cond("b"));
      expect(next.map((i) => i.name)).toEqual(["a", "b"]);
    });

    it("appends a child under an existing parent", () => {
      const items: TopLevelItem[] = [cond("a")];
      const next = insertItem(items, "a", cond("child"));
      expect(flattenTree(next).map((i) => i.name)).toEqual(["a", "child"]);
    });
  });

  describe("deleteItem", () => {
    it("removes a root item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const next = deleteItem(items, "b");
      expect(next.map((i) => i.name)).toEqual(["a", "c"]);
    });

    it("removes a nested item and all its descendants", () => {
      const items: TopLevelItem[] = [
        cond("a", [cond("a1", [cond("a1_nested")]), cond("a2")]),
        cond("b"),
      ];
      const next = deleteItem(items, "a1");
      expect(flattenTree(next).map((i) => i.name)).toEqual(["a", "a2", "b"]);
    });
  });

  describe("moveItemTo", () => {
    it("moves an item before another item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const next = moveItemTo(items, "c", "a", "before");
      expect(next.map((i) => i.name)).toEqual(["c", "a", "b"]);
    });

    it("moves an item after another item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const next = moveItemTo(items, "a", "b", "after");
      expect(next.map((i) => i.name)).toEqual(["b", "a", "c"]);
    });

    it("moves an item inside a container item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("container", [cond("existing")])];
      const next = moveItemTo(items, "a", "container", "inside");
      expect(next.map((i) => i.name)).toEqual(["container"]);
      expect(flattenTree(next).map((i) => i.name)).toEqual(["container", "existing", "a"]);
    });

    it("does not allow moving an item into its own descendant", () => {
      const items: TopLevelItem[] = [cond("parent", [cond("child")])];
      const next = moveItemTo(items, "parent", "child", "inside");
      expect(next).toEqual(items);
    });
  });

  describe("canMoveItemTo", () => {
    it("validates valid and invalid moves", () => {
      const items: TopLevelItem[] = [
        {
          type: "user_variable",
          name: "user_v",
          variable: { type: "confirm", question: "Agree?" },
        },
        {
          type: "unit_loop",
          name: "loop",
          unitset: "main",
          layout: { template: "text" },
          children: [
            {
              type: "unit_variable",
              name: "unit_v1",
              variable: { type: "confirm", question: "Notes" },
            },
            {
              type: "unit_variable",
              name: "unit_v2",
              variable: { type: "confirm", question: "More notes" },
            },
          ],
        },
      ];

      // unit_v2 can move before unit_v1
      expect(canMoveItemTo(items, "unit_v2", "unit_v1", "before")).toBe(true);

      // unit_v2 cannot move to top level (before user_v)
      expect(canMoveItemTo(items, "unit_v2", "user_v", "before")).toBe(false);

      // user_v cannot move inside unit loop
      expect(canMoveItemTo(items, "user_v", "loop", "inside")).toBe(false);

      // item cannot move relative to itself
      expect(canMoveItemTo(items, "user_v", "user_v", "before")).toBe(false);
    });
  });

  describe("moveItem", () => {
    it("moves an item up and down among siblings", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const up = moveItem(items, "b", "up");
      expect(up.map((i) => i.name)).toEqual(["b", "a", "c"]);

      const down = moveItem(items, "b", "down");
      expect(down.map((i) => i.name)).toEqual(["a", "c", "b"]);
    });

    it("moves nested siblings within a parent", () => {
      const items: TopLevelItem[] = [cond("root", [cond("c1"), cond("c2"), cond("c3")])];
      const next = moveItem(items, "c2", "up");
      expect(flattenTree(next).map((i) => i.name)).toEqual(["root", "c2", "c1", "c3"]);
    });
  });

  describe("indentItem and outdentItem", () => {
    it("indents an item into its previous sibling", () => {
      const items: TopLevelItem[] = [cond("p1"), cond("p2")];
      const next = indentItem(items, "p2");
      expect(next).toHaveLength(1);
      expect(next[0].name).toBe("p1");
      expect(flattenTree(next).map((i) => i.name)).toEqual(["p1", "p2"]);
    });

    it("outdents a nested item to become sibling after its parent", () => {
      const items: TopLevelItem[] = [cond("p1", [cond("child")]), cond("other")];
      const next = outdentItem(items, "child");
      expect(next.map((i) => i.name)).toEqual(["p1", "child", "other"]);
    });
  });

  describe("updateItem", () => {
    it("updates item properties while preserving children", () => {
      const items: TopLevelItem[] = [cond("p1", [cond("child")])];
      const next = updateItem(items, "p1", {
        type: "condition",
        name: "p1_renamed",
        expression: "x > 1",
      } as TopLevelItem);
      expect(flattenTree(next).map((i) => i.name)).toEqual(["p1_renamed", "child"]);
    });
  });
});
