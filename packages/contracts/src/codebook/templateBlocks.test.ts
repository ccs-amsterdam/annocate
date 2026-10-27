import { describe, expect, it } from "vitest";
import { parseTemplateBlocks, parseInlineCss } from "./templateBlocks.js";
import { parseTemplate } from "./references.js";

const text = (source: string, node: { start: number; end: number }) => source.slice(node.start, node.end);

describe("template blocks", () => {
  it("leaves a template without fences as one text", () => {
    const source = "# $unit.headline\n\ntext";
    const parsed = parseTemplateBlocks(source);
    expect(parsed.hasBlocks).toBe(false);
    expect(parsed.nodes).toEqual([{ type: "text", start: 0, end: source.length }]);
  });

  it("parses if / else if / else with their conditions", () => {
    const source = "before\n::: if $var.group.is('a')\nA\n::: else if $var.group.is('b')\nB\n::: else\nC\n:::\nafter";
    const { nodes, errors } = parseTemplateBlocks(source);
    expect(errors).toEqual([]);
    expect(nodes.map((n) => n.type)).toEqual(["text", "if", "text"]);
    const block = nodes[1] as Extract<(typeof nodes)[number], { type: "if" }>;
    expect(block.branches.map((b) => b.script)).toEqual(["$var.group.is('a')", "$var.group.is('b')", null]);
    expect(block.branches[0].references[0].path).toEqual(["group", "is"]);
    expect(block.branches.map((b) => text(source, b.body[0] as { start: number; end: number }))).toEqual(["A\n", "B\n", "C\n"]);
    expect(text(source, nodes[2] as { start: number; end: number })).toBe("after");
  });

  it("chains from stages and nests blocks by colons", () => {
    const source = "::: from a\nA\n::: from b\n:::: style color: red\nB\n::::\n:::";
    const { nodes, errors } = parseTemplateBlocks(source);
    expect(errors).toEqual([]);
    const from = nodes[0] as Extract<(typeof nodes)[number], { type: "from" }>;
    expect(from.stages.map((s) => s.question)).toEqual(["a", "b"]);
    expect(from.stages[1].body[0]).toMatchObject({ type: "style", style: { color: "red" } });
  });

  it("reports unclosed blocks, wrong closers and stray else", () => {
    expect(parseTemplateBlocks("::: if true\nA").errors[0].message).toMatch(/not closed/);
    expect(parseTemplateBlocks(":::: if true\nA\n:::").errors[0].message).toMatch(/4 colons/);
    expect(parseTemplateBlocks("::: else\n:::").errors[0].message).toMatch(/must follow/);
    expect(parseTemplateBlocks("::: when x\n:::").errors[0].message).toMatch(/Unknown block/);
  });

  it("ignores fences in code, and leaves fence lines out of the text", () => {
    expect(parseTemplateBlocks("```\n::: if x\n```").hasBlocks).toBe(false);
    const parsed = parseTemplate("::: if $var.x.is('a')\n$unit.text\n:::");
    expect(parsed.errors).toEqual([]);
    expect(parsed.segments.filter((s) => s.type === "expression").map((s) => (s.type === "expression" ? s.script : ""))).toEqual(["$unit.text"]);
  });

  it("reads inline CSS as a React style", () => {
    expect(parseInlineCss("color: darkred; font-size: 120%; --x: 1").style).toEqual({ color: "darkred", fontSize: "120%", "--x": "1" });
    expect(parseInlineCss("position: fixed").errors[0]).toMatch(/isn't allowed/);
    expect(parseInlineCss("bold").errors[0]).toMatch(/not a CSS declaration/);
  });
});
