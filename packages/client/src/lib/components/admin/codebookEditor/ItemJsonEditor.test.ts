import { describe, expect, it } from "vitest";
import type { CodebookItem } from "@annotinder/contracts";
import { itemFromJson, itemToJson } from "./ItemJsonEditor";

const loop = {
  _key: "k1",
  type: "unit_loop",
  name: "loop",
  units: [{ mode: "all", unitset: "__all__" }],
  layout: { template: "$unit.text" },
  children: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }],
} as unknown as CodebookItem;

describe("item JSON", () => {
  it("shows the item without its key and children, compactly", () => {
    const json = itemToJson(loop);
    expect(json).toContain('"name": "loop"');
    expect(json).toContain('"layout": { "template": "$unit.text" }');
    expect(json).not.toContain("_key");
    expect(json).not.toContain("children");
  });

  it("applies edits, keeping the key and children", () => {
    const result = itemFromJson(itemToJson(loop).replace('"name": "loop"', '"name": "main"'), loop);
    expect(result).toEqual({ item: { ...loop, name: "main" } });
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
    expect(error('{ "name": "x", "type": "condition", "children": [] }')).toMatch(/children are edited/);
  });
});
