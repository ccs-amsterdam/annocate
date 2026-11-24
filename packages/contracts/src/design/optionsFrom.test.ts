import { describe, expect, it } from "vitest";
import { inferFieldType, parseList } from "../unitFields.js";
import { NominalTypeSchema } from "./variableTypes.js";
import { resolveOptions, resolveVariable } from "./optionsFrom.js";
import { validateDesignItems } from "./validation.js";
import { shownUnitFields } from "./shownFields.js";

describe("list fields", () => {
  it("read a JSON list or words with ;, and are inferred from JSON lists", () => {
    expect(parseList('["EU", {"label": "NATO", "color": "blue"}]')).toEqual(["EU", { label: "NATO", color: "blue" }]);
    expect(parseList("EU; NATO ;")).toEqual(["EU", "NATO"]);
    expect(parseList('[{"name": "x"}]')).toBeUndefined();
    expect(inferFieldType(['["a"]', "", "[]"])).toBe("list");
    expect(inferFieldType(["a; b"])).toBe("text");
  });
});

describe("options from data", () => {
  const variable = {
    options: [{ value: "other", label: "Other" }],
    optionsFrom: { from: "$unit.topics", at: 0 },
  };

  it("puts a unit's list in its row, values from the labels unless given, unique", () => {
    const unit = { topics: ["Climate change", { label: "Other", color: "red" }, { label: "EU", value: "eu" }] };
    expect(resolveOptions(variable, { unit })).toEqual([
      { value: "climate_change", label: "Climate change" },
      { value: "other_2", label: "Other", color: "red" },
      { value: "eu", label: "EU" },
      { value: "other", label: "Other" },
    ]);
    expect(resolveOptions(variable, { unit: {} })).toEqual(variable.options);
  });

  it("makes an option of each span of an earlier span question: its text, its id, its label's colour", () => {
    const spans = [{ id: "s1", field: "text", value: "person", slices: [{ offset: 0, length: 4, text: "Anna" }] }];
    const resolved = resolveVariable(
      { type: "nominal", question: "?", options: [], optionsFrom: { from: "$var.actors" } },
      {
        answers: { actors: { done: true, skip: false, spans } },
        questions: new Map([["actors", { type: "span", options: [{ value: "person", color: "teal" }] }]]),
      },
    );
    expect(resolved).toEqual({
      type: "nominal",
      question: "?",
      options: [{ value: "s1", label: "Anna", color: "teal" }],
    });
  });

  it("lets a question have no options of its own; checks where they come from", () => {
    expect(NominalTypeSchema.safeParse({ type: "nominal", question: "?", options: [] }).success).toBe(false);
    expect(
      NominalTypeSchema.safeParse({ type: "nominal", question: "?", options: [], optionsFrom: { from: "$unit.x" } })
        .success,
    ).toBe(true);
    const loop = (children: object[]) => [
      { type: "unit_loop", units: {}, children: [{ type: "layout", template: "$unit.text" }, ...children] },
    ];
    const spanQ = {
      type: "question",
      name: "actors",
      variable: { type: "span", question: "?", options: [{ value: "p" }], fields: ["text"] },
    };
    const fromSpans = {
      type: "question",
      name: "who",
      variable: { type: "nominal", question: "?", options: [], optionsFrom: { from: "$var.actors" } },
    };
    const messages = (items: object[]) =>
      validateDesignItems(items)
        .filter((i) => !i.warning)
        .map((i) => i.message);
    expect(messages(loop([spanQ, fromSpans])).filter((m) => m.includes("$var.actors"))).toEqual([]);
    // A list field the options come from is sent to coders
    const fromUnit = { ...fromSpans, variable: { ...fromSpans.variable, optionsFrom: { from: "$unit.topics" } } };
    expect(shownUnitFields(loop([fromUnit]))).toContain("topics");
    expect(messages(loop([fromSpans, spanQ]))).toContain(
      "$var.actors: options come from a span question before this one in the same unit loop",
    );
  });
});
