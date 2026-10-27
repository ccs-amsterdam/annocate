import { describe, expect, it } from "vitest";
import type { CodebookItem } from "@annotinder/contracts";
import { itemFromYaml, itemToYaml } from "./ItemYamlEditor";

const loop = {
  _key: "k1",
  type: "unit_loop",
  name: "loop",
  units: [{ sources: [{ unitset: "__all__" }] }],
  layout: { template: "$unit.text" },
  children: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }],
} as unknown as CodebookItem;

describe("item YAML", () => {
  it("shows the item without its key and children", () => {
    const yaml = itemToYaml(loop);
    expect(yaml).toContain("name: loop");
    expect(yaml).not.toContain("_key");
    expect(yaml).not.toContain("children");
  });

  it("applies edits, keeping the key and children", () => {
    const result = itemFromYaml(itemToYaml(loop).replace("name: loop", "name: main"), loop);
    expect(result).toEqual({ item: { ...loop, name: "main" } });
  });

  it("refuses YAML that isn't an item", () => {
    const error = (text: string) => ("error" in itemFromYaml(text, loop) ? (itemFromYaml(text, loop) as { error: string }).error : null);
    expect(error("name: [unclosed")).toBeTruthy();
    expect(error("- a\n- b")).toBe("The item must be a mapping (name: ..., type: ...)");
    expect(error("name: x\ntype: nope")).toMatch(/^type must be one of/);
    expect(error("name: x\ntype: question")).toBe("A question needs a variable with a type");
    expect(error("name: x\ntype: condition\nchildren: []")).toMatch(/Children are edited/);
  });
});
