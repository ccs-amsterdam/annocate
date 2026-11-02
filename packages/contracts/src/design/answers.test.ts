import { describe, expect, it } from "vitest";
import { validateAnswer } from "./answers.js";
import { layoutWarning, resolveLayout } from "./answerLayout.js";
import { convertOptionsLevel, valueFromLabel } from "./options.js";
import type { AnyVariableType, NominalType, OrdinalType } from "./variableTypes.js";

const answer = (values: { value: string | number; item?: string }[]) => ({ done: true, skip: false, values });

describe("validateAnswer", () => {
  const role: AnyVariableType = { type: "nominal", question: "?", options: [{ value: "a" }, { value: "b" }] };
  const topics: AnyVariableType = { ...role, multiple: true };
  const age: AnyVariableType = { type: "numeric", question: "?", min: 0, max: 10, step: 0.5 };
  const scale: AnyVariableType = { type: "scale", question: "?", items: [{ name: "x" }, { name: "y" }], options: [{ value: 1 }, { value: 2 }] };

  it("accepts values of the options", () => {
    expect(validateAnswer("q", role, answer([{ value: "a" }]))).toEqual([]);
    expect(validateAnswer("q", role, answer([{ value: "c" }]))).toEqual([`'q': unknown value "c"`]);
    expect(validateAnswer("q", role, answer([{ value: "a" }, { value: "b" }]))).toEqual([`'q': only one answer allowed`]);
    expect(validateAnswer("q", topics, answer([{ value: "a" }, { value: "b" }]))).toEqual([]);
  });

  it("checks numbers against the range and step", () => {
    expect(validateAnswer("q", age, answer([{ value: 2.5 }]))).toEqual([]);
    expect(validateAnswer("q", age, answer([{ value: 2.3 }]))).toEqual([`'q': 2.3 is not a multiple of 0.5`]);
    expect(validateAnswer("q", age, answer([{ value: 11 }]))).toEqual([`'q': 11 is above the maximum 10`]);
    expect(validateAnswer("q", age, answer([{ value: "3" }]))).toEqual([`'q': "3" is not a number`]);
  });

  it("takes one answer per scale item", () => {
    expect(validateAnswer("q", scale, answer([{ item: "x", value: 1 }, { item: "y", value: 2 }]))).toEqual([]);
    expect(validateAnswer("q", scale, answer([{ item: "x", value: 1 }, { item: "x", value: 2 }]))).toEqual([
      `'q': more than one answer for item 'x'`,
    ]);
    expect(validateAnswer("q", scale, answer([{ item: "z", value: 1 }]))).toEqual([`'q': unknown item 'z'`]);
  });
});

describe("options", () => {
  it("derives values from labels", () => {
    expect(valueFromLabel("Human interest")).toBe("human_interest");
    expect(valueFromLabel("  Économie & politiek! ")).toBe("economie_politiek");
  });

  it("converts between levels", () => {
    expect(convertOptionsLevel([{ value: "pro" }, { value: "con", label: "Against" }], "ordinal")).toEqual([
      { value: 1, label: "pro" },
      { value: 2, label: "Against" },
    ]);
    expect(convertOptionsLevel([{ value: 1, label: "Very low" }, { value: 2, label: "very low" }, { value: 3 }], "nominal")).toEqual([
      { value: "very_low", label: "Very low" },
      { value: "very_low_2", label: "very low" },
      { value: "3" },
    ]);
  });
});

describe("resolveLayout", () => {
  const nominal = (labels: string[], extra: Partial<NominalType> = {}): NominalType => ({
    type: "nominal",
    question: "?",
    options: labels.map((value) => ({ value })),
    ...extra,
  });

  it("fits nominal questions on a small phone", () => {
    expect(resolveLayout(nominal(["yes", "no"]))).toEqual({ layout: "row", columns: 1 });
    expect(resolveLayout(nominal(["politics", "economy", "sports", "culture"]))).toEqual({ layout: "grid", columns: 2 });
    expect(resolveLayout(nominal(["a fairly long label of an option", "another long label here"]))).toEqual({ layout: "grid", columns: 1 });
    expect(resolveLayout(nominal(Array.from({ length: 20 }, (_, i) => `topic ${i}`)))).toEqual({ layout: "dropdown", columns: 1 });
    expect(resolveLayout(nominal(["a"], { layout: "grid", columns: 3 }))).toEqual({ layout: "grid", columns: 3 });
  });

  it("keeps ordinal options in order", () => {
    const ordinal = (n: number): OrdinalType => ({
      type: "ordinal",
      question: "?",
      options: Array.from({ length: n }, (_, i) => ({ value: i + 1 })),
    });
    expect(resolveLayout(ordinal(3)).layout).toBe("row");
    expect(resolveLayout(ordinal(5))).toEqual({ layout: "grid", columns: 1 });
    expect(resolveLayout(ordinal(7)).layout).toBe("compact");
  });

  it("picks numeric layouts from the range", () => {
    expect(resolveLayout({ type: "numeric", question: "?", min: 0, max: 10 }).layout).toBe("buttons");
    expect(resolveLayout({ type: "numeric", question: "?", min: 0, max: 100 }).layout).toBe("slider");
    expect(resolveLayout({ type: "numeric", question: "?", min: 0 }).layout).toBe("input");
  });

  it("warns when a chosen layout doesn't fit", () => {
    expect(layoutWarning(nominal(["a", "b"], { layout: "row" }))).toBeNull();
    expect(layoutWarning(nominal(["a long label", "another long label", "third"], { layout: "row" }))).toMatch(/side by side/);
    expect(layoutWarning(nominal(Array.from({ length: 10 }, (_, i) => `t${i}`), { layout: "grid" }))).toMatch(/scroll/);
  });
});
