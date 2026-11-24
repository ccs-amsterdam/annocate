import { describe, expect, it } from "vitest";
import { MAX_SNIPPET_TEXT, expandSnippets } from "./snippets.js";
import { MAX_SNIPPETS, MAX_SNIPPET_LENGTH, UnitLayoutSchema } from "./layout.js";
import { validateDesignItems } from "./validation.js";
import { shownUnitFields } from "./shownFields.js";

/** Snippets `s0`…`s<levels>`: each uses the next one twice, the last is `text`. */
function doubling(levels: number, text: string): Record<string, string> {
  const snippets: Record<string, string> = { [`s${levels}`]: text };
  for (let i = 0; i < levels; i++) snippets[`s${i}`] = `[[s${i + 1}]][[s${i + 1}]]`;
  return snippets;
}

/** What `run` returns, which it does within 100 ms (the fastest of three runs: other tests run meanwhile). */
function timed<T>(run: () => T): T {
  const times = [1, 2, 3].map(() => {
    const start = Date.now();
    run();
    return Date.now() - start;
  });
  expect(Math.min(...times)).toBeLessThan(100);
  return run();
}

const loopWith = (template: string, snippets: Record<string, string>) => ({
  type: "unit_loop",
  id: "loop_1",
  children: [
    { type: "layout", template, snippets },
    { type: "question", name: "q", variable: { type: "confirm", question: "[[s0]]" } },
  ],
});

describe("snippets", () => {
  it("are put in where they stand, snippets in snippets too", () => {
    expect(expandSnippets("a [[x]] b", { x: "[[y]]!", y: "Y" })).toEqual({
      source: "a Y! b",
      errors: [],
      tooLarge: false,
    });
    expect(expandSnippets("[[s0]]", doubling(3, "ab")).source).toBe("ab".repeat(8));
  });

  it("that multiply stop at 200 kB with one issue, within 100 ms", () => {
    for (const text of ["x", ""]) {
      const snippets = doubling(30, text);
      const expanded = timed(() => expandSnippets("[[s0]]", snippets));
      const issues = timed(() => validateDesignItems([loopWith("[[s0]]", snippets)]));
      timed(() => shownUnitFields([loopWith("$unit.text [[s0]]", snippets)]));
      expect(expanded.tooLarge).toBe(true);
      expect(expanded.errors).toEqual([
        "The snippets put more than 200 kB of text into this template: use fewer snippets in snippets",
      ]);
      expect(expanded.source.length).toBeLessThanOrEqual(MAX_SNIPPET_TEXT);
      // The layout's template and the question's text
      expect(issues.map((i) => i.message)).toEqual([expanded.errors[0], expanded.errors[0]]);
    }
  });

  it("up to the limit are put in whole", () => {
    const half = "x".repeat(MAX_SNIPPET_TEXT / 2);
    expect(expandSnippets("[[a]][[a]]", { a: half }).tooLarge).toBe(false);
    expect(expandSnippets("[[a]][[a]][[b]]", { a: half, b: "y" }).tooLarge).toBe(true);
  });

  it("a layout has at most 50 snippets of at most 20,000 characters", () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, "text"]));
    const issues = (snippets: Record<string, string>) =>
      UnitLayoutSchema.safeParse({ template: "", snippets }).error?.issues.map((i) => i.message) ?? [];
    expect(issues(many(MAX_SNIPPETS))).toEqual([]);
    expect(issues(many(MAX_SNIPPETS + 1))).toEqual(["A layout has at most 50 snippets"]);
    expect(issues({ a: "x".repeat(MAX_SNIPPET_LENGTH) })).toEqual([]);
    expect(issues({ a: "x".repeat(MAX_SNIPPET_LENGTH + 1) })).toEqual(["A snippet has at most 20,000 characters"]);
  });
});
