import { describe, expect, it } from "vitest";
import type { DesignItem } from "@annotinder/contracts";
import { itemFromJson, itemToJson } from "./itemJson";
import { updateItem } from "./itemEdit";

const loop = {
  _key: "k1",
  type: "unit_loop",
  label: "loop",
  children: [
    { type: "layout", template: "$unit.text" },
    { type: "question", name: "q", variable: { type: "confirm", question: "?" } },
  ],
} as unknown as DesignItem;

describe("item JSON", () => {
  it("shows the item without its key and children, compactly", () => {
    const json = itemToJson(loop);
    expect(json).toContain('"label": "loop"');
    expect(json).not.toContain("_key");
    expect(json).not.toContain("children");
  });

  it("applies edits, keeping the key and children", () => {
    const result = itemFromJson(itemToJson(loop).replace('"label": "loop"', '"label": "main"'), loop);
    expect(result).toEqual({ item: { ...loop, label: "main" } });
  });

  it("applies edits of a layout item, which has no name", () => {
    const layout = { _key: "y1", type: "layout", template: "$unit.text" } as unknown as DesignItem;
    const text = itemToJson(layout).replace(/\s*}\s*$/, ', "style": { "fontSize": "1.2em" } }');
    expect(itemFromJson(text, layout)).toEqual({ item: { ...layout, style: { fontSize: "1.2em" } } });
  });

  it("removes a key deleted in the JSON from the design", () => {
    const end = { _key: "k2", name: "bye", type: "end", outcome: "complete", message: "Thanks" };
    const result = itemFromJson('{ "name": "bye", "type": "end", "outcome": "complete" }', end as DesignItem);
    if ("error" in result) throw new Error(result.error);
    const [updated] = updateItem([end as never], "k2", result.item);
    expect(updated).toEqual({ _key: "k2", name: "bye", type: "end", outcome: "complete" });
  });

  it("leaves a branch's else items to the tree", () => {
    const branch = { _key: "c1", type: "branch", condition: { script: "true" }, children: [] } as unknown as DesignItem;
    const result = itemFromJson('{ "type": "branch", "condition": { "script": "true" }, "elseChildren": [] }', branch);
    expect(result).toEqual({
      error: `An item: else items are edited as items of their own: leave out "elseChildren"`,
    });
  });

  it("refuses JSON that isn't an item", () => {
    const error = (text: string) => {
      const result = itemFromJson(text, loop);
      return "error" in result ? result.error : null;
    };
    expect(error('{ "name": ')).toBeTruthy();
    expect(error("[1, 2]")).toMatch(/must be an object/);
    expect(error('{ "name": "x", "type": "nope" }')).toMatch(/type must be one of/);
    expect(error('{ "name": "x", "type": "question" }')).toBe(`'x': a question needs a "variable" with a "type"`);
    expect(error('{ "name": "x", "type": "branch", "children": [] }')).toMatch(/children are edited/);
  });
});
