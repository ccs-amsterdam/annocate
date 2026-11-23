import { describe, expect, it } from "vitest";
import { layoutsByItem, loopLayouts, loopSnippets, previewLayout } from "./layoutItems.js";
import { validateDesignItems } from "./validation.js";

const layout = (label: string, template = "$unit.text", snippets?: Record<string, string>) => ({
  type: "layout" as const,
  label,
  template,
  ...(snippets ? { snippets } : {}),
});
const question = (name: string, extra: object = {}) => ({
  type: "question",
  name,
  variable: { type: "confirm", question: `${name}?`, ...extra },
});
const labels = (candidates: ({ label?: string } | null)[] | undefined) => candidates?.map((c) => c?.label ?? null);

describe("layout items", () => {
  const children = [
    question("first"),
    layout("A"),
    question("second"),
    {
      type: "branch",
      condition: { script: "true" },
      children: [layout("B"), question("inB")],
      elseChildren: [question("inElse")],
    },
    question("after"),
    layout("C"),
    question("last"),
  ];

  it("apply from where the coder passes them, following the flow", () => {
    const by = layoutsByItem(children);
    // Before any layout item: none
    expect(labels(by.get("first"))).toEqual([null]);
    expect(labels(by.get("second"))).toEqual(["A"]);
    expect(labels(by.get("inB"))).toEqual(["B"]);
    // The else items: what applied before the branch
    expect(labels(by.get("inElse"))).toEqual(["A"]);
    // After a branch: its items' or its else items'
    expect(labels(by.get("after"))).toEqual(["B", "A"]);
    expect(labels(by.get("last"))).toEqual(["C"]);
    expect(loopLayouts(children).map((l) => l.label)).toEqual(["A", "B", "C"]);
    expect(previewLayout(children, "after")?.label).toBe("A");
    expect(previewLayout(children, "first")).toBeNull();
  });

  it("each have their own snippets; texts in the loop may use any of them", () => {
    expect(loopSnippets([layout("A", "", { a: "1", s: "x" }), layout("B", "", { b: "2", s: "y" })])).toEqual({
      a: "1",
      b: "2",
      s: "y",
    });
  });

  it("are optional, go only in a unit loop, and show what questions after them focus or select in", () => {
    const messages = (items: unknown[]) => validateDesignItems(items).map((i) => i.message);
    // No layout: questions show no unit
    expect(messages([{ type: "unit_loop", children: [question("q")] }])).toEqual([]);
    expect(messages([layout("Top")])).toContain("A layout shows a unit: it goes in a unit loop");
    const span = {
      type: "question",
      name: "spans",
      variable: { type: "span", question: "?", fields: ["text"], options: [{ value: "x" }] },
    };
    expect(messages([{ type: "unit_loop", children: [span] }])).toEqual([
      "Span question 'spans' selects text in the unit, but no layout comes before it to show the unit",
    ]);
    expect(messages([{ type: "unit_loop", children: [layout("A"), span] }])).toEqual([]);
    // Every layout that may apply must show it
    expect(
      messages([
        {
          type: "unit_loop",
          children: [
            layout("Full"),
            { type: "branch", condition: { script: "$unit.id > 1" }, children: [layout("Short", "$unit.title")] },
            span,
          ],
        },
      ]),
    ).toEqual([
      "Span question 'spans' selects text in the unit field 'text', but the layout 'Short' doesn't show it as plain text ($unit.text)",
    ]);
  });
});
