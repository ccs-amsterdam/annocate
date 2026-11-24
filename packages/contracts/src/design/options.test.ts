import { describe, expect, it } from "vitest";
import { AnnotinderTypeSchema, NominalTypeSchema, NumericTypeSchema, OrdinalTypeSchema } from "./variableTypes.js";
import { validateAnswer, type AnyVariableType } from "./answers.js";
import { buildScope } from "./references.js";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => i.message);

describe("special answers", () => {
  it("are defined once per question: each kind once, a label and an optional code", () => {
    const ordinal = (specials: object[]) =>
      OrdinalTypeSchema.safeParse({ type: "ordinal", question: "?", options: [{ value: 1 }, { value: 2 }], specials });
    expect(messages(ordinal([{ kind: "dont_know" }, { kind: "not_applicable", label: "None", value: 99 }]))).toEqual(
      [],
    );
    expect(messages(ordinal([{ kind: "dont_know" }, { kind: "dont_know" }]))).toEqual([
      "A question has each special answer once",
    ]);
    expect(messages(ordinal([{ kind: "dont_know", value: 2 }]))).toEqual([
      `The code of "Don't know" is also an option's value`,
    ]);
    expect(messages(ordinal([{ kind: "dont_know", value: "x" }]))).toEqual([
      `The code of "Don't know" is a number here`,
    ]);
    const nominal = NominalTypeSchema.safeParse({
      type: "nominal",
      question: "?",
      options: [{ value: "a" }],
      specials: [{ kind: "not_applicable", value: 0 }],
    });
    expect(messages(nominal)).toEqual([`The code of "Not applicable" is text here, like the option values`]);
    const age = NumericTypeSchema.safeParse({
      type: "numeric",
      question: "?",
      min: 0,
      max: 120,
      specials: [{ kind: "dont_know", value: 99 }],
    });
    expect(messages(age)).toEqual(["A special answer's code (99) is inside min..max"]);
  });

  it("aren't for swiping", () => {
    const swipe = AnnotinderTypeSchema.safeParse({
      type: "annotinder",
      question: "?",
      options: [{ value: "a" }, { value: "b" }],
      specials: [{ kind: "dont_know" }],
    });
    expect(swipe.success && "specials" in swipe.data).toBe(false);
  });

  it("are answered with their kind, and their code as the value if they have one", () => {
    const variable = {
      type: "nominal",
      question: "?",
      multiple: true,
      options: [{ value: "a" }, { value: "b" }],
      specials: [{ kind: "dont_know" }, { kind: "not_applicable", value: "na" }],
    } as AnyVariableType;
    expect(validateAnswer("q", variable, { done: true, skip: false, values: [{ special: "dont_know" }] })).toEqual([]);
    expect(
      validateAnswer("q", variable, { done: true, skip: false, values: [{ special: "not_applicable", value: "na" }] }),
    ).toEqual([]);
    expect(validateAnswer("q", variable, { done: true, skip: false, values: [{ special: "not_applicable" }] })).toEqual(
      [`'q': 'not_applicable' is stored as "na"`],
    );
    expect(
      validateAnswer("q", variable, { done: true, skip: false, values: [{ value: "a" }, { special: "dont_know" }] }),
    ).toEqual(["'q': a special answer is the only answer"]);
    const scope = buildScope(new Map([["q", variable]]), {
      q: { done: true, skip: false, values: [{ special: "dont_know" }] },
    });
    expect(scope.$var.q).toEqual({ answered: true, values: [], labels: ["Don't know"] });
  });
});

describe("responsive layouts", () => {
  it("auto follows the screen and the coder's keys; a chosen layout stays", async () => {
    const { resolveLayout } = await import("./answerLayout.js");
    const nominal = (labels: string[], layout?: string) =>
      ({ type: "nominal", question: "?", options: labels.map((value) => ({ value })), layout }) as never;
    const five = nominal(["one", "two", "three", "four", "five"]);
    expect(resolveLayout(five)).toEqual({ layout: "grid", columns: 2 });
    expect(resolveLayout(five, { width: "narrow" })).toEqual({ layout: "grid", columns: 2 });
    expect(resolveLayout(five, { width: "wide" })).toEqual({ layout: "row", columns: 1 });
    expect(resolveLayout(five, { width: "narrow", keys: "numpad" })).toEqual({ layout: "grid", columns: 3 });
    expect(resolveLayout(nominal(["a", "b"], "grid"), { width: "wide", keys: "numpad" })).toEqual({
      layout: "grid",
      columns: 1,
    });
    // Long lists: a dropdown, but buttons for typing to filter
    const many = nominal(Array.from({ length: 30 }, (_, i) => `a fairly long category ${i}`));
    expect(resolveLayout(many)).toEqual({ layout: "dropdown", columns: 1 });
    expect(resolveLayout(many, { width: "narrow", keys: "filter" })).toEqual({ layout: "flex", columns: 1 });
    // Ten short ones (they'd fit a grid): a dropdown too; nine still get buttons
    const ten = nominal(Array.from({ length: 10 }, (_, i) => `c${i}`));
    expect(resolveLayout(ten)).toEqual({ layout: "dropdown", columns: 1 });
    expect(resolveLayout(ten, { width: "wide" })).toEqual({ layout: "dropdown", columns: 1 });
    expect(resolveLayout(nominal(Array.from({ length: 9 }, (_, i) => `c${i}`)))).toEqual({
      layout: "grid",
      columns: 2,
    });
  });
});
