import { describe, expect, it } from "vitest";
import { validateAnswer } from "./answers.js";
import { layoutWarning, resolveLayout } from "./answerLayout.js";
import { convertOptionsLevel, valueFromLabel } from "./options.js";
import type { AnyVariableType, NominalType, OrdinalType } from "./variableTypes.js";
import { VariableValueSchema } from "../variableValue.js";

const answer = (values: { value: string | number; item?: string }[]) => ({ done: true, skip: false, values });

describe("validateAnswer", () => {
  const role: AnyVariableType = { type: "nominal", question: "?", options: [{ value: "a" }, { value: "b" }] };
  const topics: AnyVariableType = { ...role, multiple: true };
  const age: AnyVariableType = { type: "numeric", question: "?", min: 0, max: 10, step: 0.5 };
  const scale: AnyVariableType = {
    type: "scale",
    question: "?",
    items: [{ name: "x" }, { name: "y" }],
    options: [{ value: 1 }, { value: 2 }],
  };

  it("accepts values of the options", () => {
    expect(validateAnswer("q", role, answer([{ value: "a" }]))).toEqual([]);
    expect(validateAnswer("q", role, answer([{ value: "c" }]))).toEqual([`'q': unknown value "c"`]);
    expect(validateAnswer("q", role, answer([{ value: "a" }, { value: "b" }]))).toEqual([
      `'q': only one answer allowed`,
    ]);
    expect(validateAnswer("q", topics, answer([{ value: "a" }, { value: "b" }]))).toEqual([]);
  });

  it("takes typed text for an open answer, up to its length", () => {
    const comment: AnyVariableType = { type: "text", question: "?", maxLength: 5 };
    expect(validateAnswer("q", comment, answer([{ value: "hello" }]))).toEqual([]);
    expect(validateAnswer("q", comment, answer([{ value: "hello!" }]))).toEqual([`'q': longer than 5 characters`]);
    expect(validateAnswer("q", comment, answer([{ value: 3 }]))).toEqual([`'q': 3 is not text`]);
    expect(validateAnswer("q", comment, answer([{ value: "a" }, { value: "b" }]))).toEqual([
      `'q': only one answer allowed`,
    ]);
  });

  it("checks numbers against the range and step", () => {
    expect(validateAnswer("q", age, answer([{ value: 2.5 }]))).toEqual([]);
    expect(validateAnswer("q", age, answer([{ value: 2.3 }]))).toEqual([`'q': 2.3 is not a multiple of 0.5`]);
    expect(validateAnswer("q", age, answer([{ value: 11 }]))).toEqual([`'q': 11 is above the maximum 10`]);
    expect(validateAnswer("q", age, answer([{ value: "3" }]))).toEqual([`'q': "3" is not a number`]);
  });

  it("takes one answer per scale item", () => {
    expect(
      validateAnswer(
        "q",
        scale,
        answer([
          { item: "x", value: 1 },
          { item: "y", value: 2 },
        ]),
      ),
    ).toEqual([]);
    expect(
      validateAnswer(
        "q",
        scale,
        answer([
          { item: "x", value: 1 },
          { item: "x", value: 2 },
        ]),
      ),
    ).toEqual([`'q': more than one answer for item 'x'`, `'q': no answer for item 'y'`]);
    expect(validateAnswer("q", scale, answer([{ item: "z", value: 1 }]))).toEqual([
      `'q': unknown item 'z'`,
      `'q': no answer for item 'x'`,
      `'q': no answer for item 'y'`,
    ]);
  });

  describe("an answer without a skip answers the question", () => {
    const empty = [
      { done: true, skip: false },
      { done: true, skip: false, values: [] },
      { done: false, skip: false },
    ];
    const skipped = { done: true, skip: true };

    it("one value for a single choice, a number and a text", () => {
      const ordinal: AnyVariableType = { type: "ordinal", question: "?", options: [{ value: 1 }, { value: 2 }] };
      const swipe: AnyVariableType = {
        type: "annotinder",
        question: "?",
        options: [{ value: "no" }, { value: "yes" }],
      };
      const text: AnyVariableType = { type: "text", question: "?" };
      for (const variable of [role, ordinal, swipe, age, text]) {
        for (const value of empty)
          expect([variable.type, validateAnswer("q", variable, value)]).toEqual([variable.type, [`'q': no answer`]]);
        expect(validateAnswer("q", variable, skipped)).toEqual([]);
      }
      expect(validateAnswer("q", text, answer([{ value: "  " }]))).toEqual([`'q': an empty text`]);
    });

    it("but several choices may be none, and a confirmation has no value", () => {
      for (const value of empty) {
        expect(validateAnswer("q", topics, value)).toEqual([]);
        expect(validateAnswer("q", { type: "confirm", question: "?" }, value)).toEqual([]);
      }
    });

    it("every scale item, with a value or a special answer", () => {
      const withSpecial: AnyVariableType = { ...scale, specials: [{ kind: "dont_know" }] } as AnyVariableType;
      expect(validateAnswer("q", scale, answer([{ item: "x", value: 1 }]))).toEqual([`'q': no answer for item 'y'`]);
      expect(validateAnswer("q", scale, { done: true, skip: false })).toEqual([
        `'q': no answer for item 'x'`,
        `'q': no answer for item 'y'`,
      ]);
      const mixed = {
        done: true,
        skip: false,
        values: [
          { item: "x", value: 1 },
          { item: "y", special: "dont_know" as const },
        ],
      };
      expect(validateAnswer("q", withSpecial, mixed)).toEqual([]);
      expect(validateAnswer("q", scale, skipped)).toEqual([]);
    });
  });

  describe("spans and relations", () => {
    const entities: AnyVariableType = {
      type: "span",
      question: "?",
      fields: ["headline", "text"],
      options: [{ value: "person" }],
    };
    const links: AnyVariableType = {
      type: "relation",
      question: "?",
      options: [{ value: "knows" }],
      rules: [{ from: { variable: "entities" }, to: { variable: "entities" } }],
    };
    const span = (id: string, field = "text") => ({
      id,
      field,
      value: "person",
      slices: [{ offset: 0, length: 4, text: "Anna" }],
    });
    const spans = (...list: ReturnType<typeof span>[]) => ({ done: true, skip: false, spans: list });

    it("a span is in one of the question's fields", () => {
      expect(validateAnswer("q", entities, spans(span("1"), span("2", "headline")))).toEqual([]);
      expect(validateAnswer("q", entities, spans(span("1", "byline")))).toEqual([
        `'q': a span in 'byline', which is not a field of this question`,
      ]);
      // No spans: nothing to mark in this unit
      expect(validateAnswer("q", entities, spans())).toEqual([]);
    });

    it("span ids and relation ids are unique", () => {
      expect(validateAnswer("q", entities, spans(span("1"), span("2"), span("1")))).toEqual([
        `'q': two spans have the id '1'`,
      ]);
      const relation = (id: string) => ({ id, fromId: "1", toId: "2", value: "knows" });
      const relations = { done: true, skip: false, relations: [relation("r"), relation("r")] };
      expect(validateAnswer("q", links, relations)).toEqual([`'q': two relations have the id 'r'`]);
    });
  });
});

describe("VariableValueSchema", () => {
  const span = { id: "s1", field: "text", value: "person", slices: [{ offset: 0, length: 4, text: "Anna" }] };

  it("refuses keys it doesn't know, at every level", () => {
    expect(VariableValueSchema.safeParse({ done: true, skip: false, values: [{ value: "a" }] }).success).toBe(true);
    expect(VariableValueSchema.safeParse({ done: true, extra: 1 }).success).toBe(false);
    expect(VariableValueSchema.safeParse({ values: [{ value: "a", note: "x" }] }).success).toBe(false);
    expect(VariableValueSchema.safeParse({ spans: [span] }).success).toBe(true);
    expect(VariableValueSchema.safeParse({ spans: [{ ...span, color: "red" }] }).success).toBe(false);
    expect(VariableValueSchema.safeParse({ spans: [{ ...span, slices: [{ ...span.slices[0], x: 1 }] }] }).success).toBe(
      false,
    );
    const relation = { id: "r1", fromId: "s1", toId: "s2", value: "knows" };
    expect(VariableValueSchema.safeParse({ relations: [relation] }).success).toBe(true);
    expect(VariableValueSchema.safeParse({ relations: [{ ...relation, weight: 2 }] }).success).toBe(false);
  });

  it("takes span and relation ids of at most 64 letters, digits, _ and -", () => {
    const withId = (id: string) => VariableValueSchema.safeParse({ spans: [{ ...span, id }] }).success;
    for (const id of ["s1", "1732480000000-k3j9x", "a_b-C", "x".repeat(64)])
      expect([id, withId(id)]).toEqual([id, true]);
    for (const id of ["", "a b", "a.b", "é", "<script>", "x".repeat(65)]) expect([id, withId(id)]).toEqual([id, false]);
  });

  it("keeps done: false unless given", () => {
    expect(VariableValueSchema.parse({})).toEqual({ done: false, skip: false });
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
    expect(
      convertOptionsLevel([{ value: 1, label: "Very low" }, { value: 2, label: "very low" }, { value: 3 }], "nominal"),
    ).toEqual([{ value: "very_low", label: "Very low" }, { value: "very_low_2", label: "very low" }, { value: "3" }]);
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
    expect(resolveLayout(nominal(["politics", "economy", "sports", "culture"]))).toEqual({
      layout: "grid",
      columns: 2,
    });
    expect(resolveLayout(nominal(["a fairly long label of an option", "another long label here"]))).toEqual({
      layout: "grid",
      columns: 1,
    });
    expect(resolveLayout(nominal(Array.from({ length: 20 }, (_, i) => `topic ${i}`)))).toEqual({
      layout: "dropdown",
      columns: 1,
    });
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
    expect(resolveLayout({ type: "numeric", question: "?", min: 1, max: 6 }).layout).toBe("buttons");
    expect(resolveLayout({ type: "numeric", question: "?", min: 1, max: 7 }).layout).toBe("slider");
    expect(resolveLayout({ type: "numeric", question: "?", min: 0, max: 10 }).layout).toBe("slider");
    expect(resolveLayout({ type: "numeric", question: "?", min: 0, max: 100 }).layout).toBe("slider");
    expect(resolveLayout({ type: "numeric", question: "?", min: 0 }).layout).toBe("input");
  });

  it("warns when a chosen layout doesn't fit", () => {
    expect(layoutWarning(nominal(["a", "b"], { layout: "row" }))).toBeNull();
    expect(layoutWarning(nominal(["a long label", "another long label", "third"], { layout: "row" }))).toMatch(
      /side by side/,
    );
    expect(
      layoutWarning(
        nominal(
          Array.from({ length: 10 }, (_, i) => `t${i}`),
          { layout: "grid" },
        ),
      ),
    ).toMatch(/scroll/);
  });
});
