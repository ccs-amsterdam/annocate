import { describe, expect, it } from "vitest";
import { SafeNameSchema, nameError, own } from "./common.js";
import { StudyWriteSchema } from "./study.js";
import { UnitLayoutSchema } from "./design/layout.js";
import { DesignItemsSchema } from "./design/designVersion.js";
import { validateDesignItems } from "./design/validation.js";
import { expandSnippets } from "./design/snippets.js";
import { loopSnippets } from "./design/layoutItems.js";
import { buildScope, referenceShape, referenceValue } from "./design/references.js";
import { evaluateSimpleCondition } from "./design/condition.js";
import { resolveOptions } from "./design/optionsFrom.js";
import { resolveRedirects } from "./design/item.js";
import { highlightRanges, parseHighlightQuery, type HighlightQuery } from "./design/highlight.js";
import { parseTemplateBlocks } from "./design/templateBlocks.js";
import { validateVariables } from "./design/answers.js";
import type { AnyVariableType } from "./design/variableTypes.js";

const confirm: AnyVariableType = { type: "confirm", question: "?" };
const question = (name: string, variable: object = confirm) => ({ type: "question", name, variable });
const loop = (children: object[], layout: object = { template: "" }) => ({
  type: "unit_loop",
  id: "loop_1",
  children: [{ type: "layout", ...layout }, ...children],
});
const messages = (items: unknown[]) => validateDesignItems(items).map((i) => i.message);

describe("names", () => {
  it("start with a letter, then letters, digits and _, at most 64 characters", () => {
    for (const name of ["a", "topic", "Topic_2", "toString", "a".repeat(64)]) {
      expect([name, nameError(name)]).toEqual([name, null]);
      expect(SafeNameSchema.safeParse(name).success).toBe(true);
    }
    for (const name of ["", "1st", "_private", "a-b", "a b", "é", "a".repeat(65)]) {
      expect([name, typeof nameError(name)]).toEqual([name, "string"]);
      expect(SafeNameSchema.safeParse(name).success).toBe(false);
    }
  });

  it("are not names every object has", () => {
    for (const name of ["__proto__", "constructor", "prototype"])
      expect(SafeNameSchema.safeParse(name).success).toBe(false);
    expect(nameError("constructor")).toBe("'constructor' can't be used as a name");
  });

  it("of questions, scale items, URL parameters, snippets, blocks and redirect settings follow the rule", () => {
    const scale = { type: "scale", question: "?", items: [{ name: "1st", label: "First" }], options: [{ value: 1 }] };
    const designs: unknown[][] = [
      [loop([question("1st")])],
      [loop([question("constructor")])],
      [loop([question("q", scale)])],
      [loop([question("q")], { template: "", snippets: { _intro: "Hello" } })],
      [loop([question("q")], { template: "", snippets: { constructor: "Hello" } })],
      [{ type: "session", urlParams: [{ name: "2nd" }] }, loop([question("q")])],
      [loop([question("q")]), { type: "end", name: "done", redirectSetting: "1st" }],
    ];
    for (const design of designs)
      expect([design, DesignItemsSchema.safeParse(design).success]).toEqual([design, false]);
    expect(messages([loop([question("1st")])])).toContainEqual(
      "Name '1st': a name starts with a letter, then letters, digits and _",
    );
    expect(parseTemplateBlocks("::: text _quote\nHello\n:::").errors).toHaveLength(1);
    expect(parseTemplateBlocks("::: text constructor\nHello\n:::").errors).toHaveLength(1);
    expect(parseTemplateBlocks("::: text quote\nHello\n:::").errors).toEqual([]);
    expect(UnitLayoutSchema.safeParse({ template: "", snippets: { intro: "Hello" } }).success).toBe(true);
    expect(StudyWriteSchema.safeParse({ name: "s", redirectUrls: { panel: "https://example.com" } }).success).toBe(
      true,
    );
    expect(StudyWriteSchema.safeParse({ name: "s", redirectUrls: { _panel: "https://example.com" } }).success).toBe(
      false,
    );
  });
});

describe("lookups by a name from a design never read Object.prototype", () => {
  it("own: only what the record itself has", () => {
    expect(own({ a: 1 }, "a")).toBe(1);
    expect(own({ a: 1 }, "toString")).toBeUndefined();
    expect(own({ a: 1 }, "constructor")).toBeUndefined();
    expect(own({ a: 1 }, "__proto__")).toBeUndefined();
    expect(own(undefined, "a")).toBeUndefined();
  });

  it("a template with [[constructor]] [[toString]] gets issues, it doesn't throw", () => {
    const design = [loop([question("q")], { template: "[[constructor]] [[toString]]" })];
    expect(messages(design)).toEqual([
      "[[constructor]]: there is no snippet 'constructor' in this loop's layout",
      "[[toString]]: there is no snippet 'toString' in this loop's layout",
    ]);
    expect(expandSnippets("[[toString]]", {}).source).toBe("");
  });

  it("a snippet that is not a string is an unknown snippet", () => {
    const snippets = { a: 3 } as unknown as Record<string, string>;
    expect(expandSnippets("x [[a]]", snippets)).toEqual({
      source: "x ",
      errors: ["[[a]]: there is no snippet 'a' in this loop's layout"],
      tooLarge: false,
    });
  });

  it("a snippet named __proto__ stays a snippet of its own when layouts are merged", () => {
    const layout = { type: "layout", template: "", snippets: JSON.parse('{"__proto__": "x", "a": "y"}') as object };
    const merged = loopSnippets([layout]);
    expect(Object.keys(merged).sort()).toEqual(["__proto__", "a"]);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
  });

  it("the scope: a question named __proto__ doesn't empty $var; an unanswered toString is unanswered", () => {
    const scale: AnyVariableType = {
      type: "scale",
      question: "?",
      items: [{ name: "__proto__", label: "A" }],
      options: [{ value: 1 }],
    };
    const questions = new Map<string, AnyVariableType>([
      ["__proto__", confirm],
      ["toString", { type: "text", question: "?" }],
      ["matrix", scale],
    ]);
    const scope = buildScope(questions, {});
    expect(Object.keys(scope.$var).sort()).toEqual(["__proto__", "matrix", "toString"]);
    expect(scope.$var.toString).toEqual({ answered: false, value: null, label: null });
    expect(Object.keys(scope.$var.matrix.items ?? {})).toEqual(["__proto__"]);
  });

  it("references and conditions on names the scope doesn't have are undefined and false", () => {
    const scope = buildScope(new Map([["q", confirm]]), {}, { text: "Hello" }, { source: "panel" });
    expect(referenceValue(scope, { ns: "unit", path: ["constructor"] })).toBeUndefined();
    expect(referenceValue(scope, { ns: "unit", path: ["text", "constructor"] })).toBeUndefined();
    expect(referenceValue(scope, { ns: "var", path: ["toString"] })).toBeUndefined();
    expect(referenceValue(scope, { ns: "session", path: ["hasOwnProperty"] })).toBeUndefined();
    expect(referenceValue(scope, { ns: "unit", path: ["text"] })).toBe("Hello");
    expect(evaluateSimpleCondition({ op: "answered", question: "constructor" }, scope)).toBe(false);
    expect(evaluateSimpleCondition({ op: "call", question: "toString", method: "is", args: ["a"] }, scope)).toBe(false);
    expect(
      evaluateSimpleCondition({ op: "call", question: "q", item: "valueOf", method: "is", args: ["a"] }, scope),
    ).toBe(false);
  });

  it("a method that is no helper is named as written", () => {
    const shape = referenceShape(new Map([["q", confirm]]), { ns: "var", path: ["q", "toString"], call: true });
    expect(shape).toMatchObject({ ok: false });
    expect((shape as { reason: string }).reason).toContain(".toString()");
    expect((shape as { reason: string }).reason).not.toContain("function");
  });

  it("options from a field or question the unit doesn't have are none", () => {
    const from = (source: string) => ({ options: [], optionsFrom: { from: source } });
    expect(resolveOptions(from("$unit.constructor"), { unit: {}, answers: {} })).toEqual([]);
    expect(resolveOptions(from("$var.toString"), { unit: {}, answers: {} })).toEqual([]);
  });

  it("a relation's rules about a question without an answer, and redirect settings without a URL", () => {
    const relation: AnyVariableType = {
      type: "relation",
      question: "?",
      options: [{ value: "r" }],
      rules: [{ from: { variable: "toString" }, to: { variable: "valueOf" } }],
    };
    const value = { done: true, skip: false, relations: [{ id: "1", fromId: "a", toId: "b", value: "r" }] };
    expect(validateVariables(new Map([["rel", relation]]), { rel: value })).toEqual([
      "'rel': a relation refers to a span that isn't there",
    ]);
    const end = { type: "end", name: "done", redirectSetting: "constructor" };
    expect(resolveRedirects([end], {})).toEqual([{ type: "end", name: "done" }]);
  });

  it("highlights in a field named constructor", () => {
    const parsed = parseHighlightQuery("climate") as { query: HighlightQuery };
    expect(highlightRanges(parsed.query, { constructor: "the climate" })).toEqual({ constructor: [[4, 11]] });
  });
});
