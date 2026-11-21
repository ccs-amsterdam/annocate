import { describe, expect, it } from "vitest";
import { AnnotinderTypeSchema, NominalTypeSchema, OrdinalTypeSchema } from "./variableTypes.js";
import { ordinaryOptions, specialOptions } from "./options.js";

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => i.message);

describe("special options", () => {
  it("are outside an ordinal scale's order, each kind once per question", () => {
    const scale = (options: object[]) => OrdinalTypeSchema.safeParse({ type: "ordinal", question: "?", options });
    expect(
      messages(
        scale([
          { value: 1 },
          { value: 2 },
          { value: 98, special: "dont_know" },
          { value: 99, special: "not_applicable" },
        ]),
      ),
    ).toEqual([]);
    // Anywhere, any number: the order is the other options'
    expect(messages(scale([{ value: 0, special: "not_applicable" }, { value: 1 }, { value: 2 }]))).toEqual([]);
    expect(messages(scale([{ value: 1 }, { value: 2, special: "dont_know" }, { value: 2 }]))).toEqual([
      "Ordinal values are each used once (2 is used twice)",
    ]);
    expect(
      messages(
        NominalTypeSchema.safeParse({
          type: "nominal",
          question: "?",
          options: [
            { value: "a", special: "dont_know" },
            { value: "b", special: "dont_know" },
          ],
        }),
      ),
    ).toEqual([`Two options are "Don't know": a question has each special option once`]);
  });

  it("aren't for swiping", () => {
    const swipe = AnnotinderTypeSchema.safeParse({
      type: "annotinder",
      question: "?",
      options: [{ value: "a" }, { value: "b", special: "not_applicable" }],
    });
    expect(messages(swipe)).toEqual(["Only categories, ordinal and scale questions have special options"]);
  });

  it("are told apart from the others", () => {
    const options = [{ value: "a" }, { value: "na", special: "not_applicable" as const }, { value: "b" }];
    expect(ordinaryOptions(options).map((o) => o.value)).toEqual(["a", "b"]);
    expect(specialOptions(options).map((o) => o.value)).toEqual(["na"]);
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
  });
});
