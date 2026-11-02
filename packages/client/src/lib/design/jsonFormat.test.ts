import { describe, expect, it } from "vitest";
import { formatJson } from "./jsonFormat";

describe("formatJson", () => {
  it("keeps small objects and arrays of plain values on one line", () => {
    const item = {
      name: "tone",
      type: "question",
      variable: {
        type: "nominal",
        question: "Tone?",
        options: [{ value: "neg", label: "Negative", color: "#ef4444" }, { value: "pos" }],
      },
    };
    expect(formatJson(item)).toBe(
      [
        "{",
        '  "name": "tone",',
        '  "type": "question",',
        '  "variable": {',
        '    "type": "nominal",',
        '    "question": "Tone?",',
        '    "options": [',
        '      { "value": "neg", "label": "Negative", "color": "#ef4444" },',
        '      { "value": "pos" }',
        "    ]",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  it("puts keys in reading order, children last", () => {
    const stored = { children: [], label: "c", type: "condition", condition: { script: "true" } };
    expect(formatJson(stored)).toBe(
      ["{", '  "type": "condition",', '  "label": "c",', '  "condition": { "script": "true" },', '  "children": []', "}"].join("\n"),
    );
    expect(formatJson({ color: "red", label: "Neg", value: "neg" })).toBe('{ "value": "neg", "label": "Neg", "color": "red" }');
  });

  it("breaks what doesn't fit, and round-trips", () => {
    const long = { question: "x".repeat(120), list: Array.from({ length: 40 }, (_, i) => i) };
    const text = formatJson(long);
    expect(text.split("\n").length).toBeGreaterThan(3);
    expect(JSON.parse(text)).toEqual(long);
    expect(formatJson({ a: [], b: {}, c: null })).toBe('{ "a": [], "b": {}, "c": null }');
  });
});
