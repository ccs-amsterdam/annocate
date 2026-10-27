import { describe, it, expect } from "vitest";
import type { TopLevelItem, CodebookItem } from "@annotinder/contracts";
import {
  canMoveItemTo,
  canMoveToRootEnd,
  deleteItem,
  indentItem,
  insertItem,
  insertItemBefore,
  moveItem,
  moveItemTo,
  moveToRootEnd,
  outdentItem,
  updateItem,
} from "./codebookEdit";
import { flattenTree, keyOf } from "./tree";

/** A condition; it has no name, so the tests identify it by its editor key. */
function cond(key: string, children: CodebookItem[] = []): TopLevelItem {
  return { _key: key, type: "condition", condition: { script: "true" }, children: children as TopLevelItem[] } as TopLevelItem;
}

describe("codebookEdit", () => {
  describe("insertItem", () => {
    it("appends a new root item when parent is null", () => {
      const items: TopLevelItem[] = [cond("a")];
      const next = insertItem(items, null, cond("b"));
      expect(next.map(keyOf)).toEqual(["a", "b"]);
    });

    it("appends a child under an existing parent", () => {
      const items: TopLevelItem[] = [cond("a")];
      const next = insertItem(items, "a", cond("child"));
      expect(flattenTree(next).map(keyOf)).toEqual(["a", "child"]);
    });
  });

  describe("insertItemBefore", () => {
    it("inserts an item before the specified root item", () => {
      const items: TopLevelItem[] = [cond("b"), cond("c")];
      const next = insertItemBefore(items, "b", cond("a"));
      expect(next.map(keyOf)).toEqual(["a", "b", "c"]);
    });

    it("inserts an item before a middle item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("c")];
      const next = insertItemBefore(items, "c", cond("b"));
      expect(next.map(keyOf)).toEqual(["a", "b", "c"]);
    });

    it("inserts an item before a nested child item", () => {
      const items: TopLevelItem[] = [cond("p", [cond("child2")])];
      const next = insertItemBefore(items, "child2", cond("child1"));
      expect(flattenTree(next).map(keyOf)).toEqual(["p", "child1", "child2"]);
    });
  });

  describe("deleteItem", () => {
    it("removes a root item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const next = deleteItem(items, "b");
      expect(next.map(keyOf)).toEqual(["a", "c"]);
    });

    it("removes a nested item and all its descendants", () => {
      const items: TopLevelItem[] = [
        cond("a", [cond("a1", [cond("a1_nested")]), cond("a2")]),
        cond("b"),
      ];
      const next = deleteItem(items, "a1");
      expect(flattenTree(next).map(keyOf)).toEqual(["a", "a2", "b"]);
    });
  });

  describe("moveItemTo", () => {
    it("moves an item before another item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const next = moveItemTo(items, "c", "a", "before");
      expect(next.map(keyOf)).toEqual(["c", "a", "b"]);
    });

    it("moves an item after another item", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const next = moveItemTo(items, "a", "b", "after");
      expect(next.map(keyOf)).toEqual(["b", "a", "c"]);
    });

    it("moves an item to become a child", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b")];
      const next = moveItemTo(items, "b", "a", "inside");
      expect(next).toHaveLength(1);
      expect(flattenTree(next).map(keyOf)).toEqual(["a", "b"]);
    });
  });

  describe("canMoveToRootEnd and moveToRootEnd", () => {
    it("allows moving root item to root end if not already at end", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b")];
      expect(canMoveToRootEnd(items, "a")).toBe(true);
      expect(canMoveToRootEnd(items, "b")).toBe(false);

      const next = moveToRootEnd(items, "a");
      expect(next.map(keyOf)).toEqual(["b", "a"]);
    });

    it("allows moving nested item to root end", () => {
      const items: TopLevelItem[] = [cond("loop", [cond("nested")]), cond("after")];
      expect(canMoveToRootEnd(items, "nested")).toBe(true);

      const next = moveToRootEnd(items, "nested");
      expect(next.map(keyOf)).toEqual(["loop", "after", "nested"]);
    });

    it("prevents moving span question to root end (outside loop)", () => {
      const loop: TopLevelItem = {
        type: "unit_loop",
        name: "loop",
        units: [{ mode: "all", unitset: "test" }],
        layout: { template: "" },
        children: [
          {
            type: "question",
            name: "span_q",
            variable: { type: "span", question: "Highlight", column: "text", options: [{ value: "A" }] },
          },
        ],
      };
      const items: TopLevelItem[] = [loop];
      expect(canMoveToRootEnd(items, "span_q")).toBe(false);
    });
  });

  describe("canMoveItemTo question restrictions", () => {
    const loop: TopLevelItem = {
      type: "unit_loop",
      name: "loop",
      units: [{ mode: "all", unitset: "test" }],
      layout: { template: "" },
      children: [
        {
          type: "question",
          name: "in_loop_q",
          variable: { type: "confirm", question: "Confirm?" },
        },
      ],
    };

    it("prevents moving question with auto inside loop", () => {
      const autoQ: TopLevelItem = {
        type: "question",
        name: "auto_q",
        variable: { type: "auto", source: "random" },
      };
      const items: TopLevelItem[] = [autoQ, loop];
      expect(canMoveItemTo(items, "auto_q", "in_loop_q", "before")).toBe(false);
      expect(canMoveItemTo(items, "auto_q", "loop", "inside")).toBe(false);
    });

    it("prevents moving question with span outside loop", () => {
      const spanLoop: TopLevelItem = {
        type: "unit_loop",
        name: "loop",
        units: [{ mode: "all", unitset: "test" }],
        layout: { template: "" },
        children: [
          {
            type: "question",
            name: "span_q",
            variable: { type: "span", question: "Highlight", column: "text", options: [{ value: "A" }] },
          },
        ],
      };
      const topQ: TopLevelItem = {
        type: "question",
        name: "top_q",
        variable: { type: "confirm", question: "Yes?" },
      };
      const items: TopLevelItem[] = [spanLoop, topQ];
      expect(canMoveItemTo(items, "span_q", "top_q", "before")).toBe(false);
      expect(canMoveItemTo(items, "span_q", "top_q", "after")).toBe(false);
    });
  });

  describe("moveItem", () => {
    it("moves an item up and down among siblings", () => {
      const items: TopLevelItem[] = [cond("a"), cond("b"), cond("c")];
      const up = moveItem(items, "b", "up");
      expect(up.map(keyOf)).toEqual(["b", "a", "c"]);

      const down = moveItem(items, "b", "down");
      expect(down.map(keyOf)).toEqual(["a", "c", "b"]);
    });

    it("moves nested siblings within a parent", () => {
      const items: TopLevelItem[] = [cond("root", [cond("c1"), cond("c2"), cond("c3")])];
      const next = moveItem(items, "c2", "up");
      expect(flattenTree(next).map(keyOf)).toEqual(["root", "c2", "c1", "c3"]);
    });
  });

  describe("indentItem and outdentItem", () => {
    it("indents an item into its previous sibling", () => {
      const items: TopLevelItem[] = [cond("p1"), cond("p2")];
      const next = indentItem(items, "p2");
      expect(next).toHaveLength(1);
      expect(keyOf(next[0])).toBe("p1");
      expect(flattenTree(next).map(keyOf)).toEqual(["p1", "p2"]);
    });

    it("outdents a nested item to become sibling after its parent", () => {
      const items: TopLevelItem[] = [cond("p1", [cond("child")]), cond("other")];
      const next = outdentItem(items, "child");
      expect(next.map(keyOf)).toEqual(["p1", "child", "other"]);
    });
  });

  describe("updateItem", () => {
    it("updates item properties while preserving children", () => {
      const items: TopLevelItem[] = [cond("p1", [cond("child")])];
      const next = updateItem(items, "p1", {
        type: "condition",
        label: "relabeled",
        condition: { script: "$var.x.value > 1" },
      } as unknown as TopLevelItem);
      expect(flattenTree(next).map(keyOf)).toEqual(["p1", "child"]);
      expect(next[0]).toMatchObject({ label: "relabeled", condition: { script: "$var.x.value > 1" } });
    });
  });
});
