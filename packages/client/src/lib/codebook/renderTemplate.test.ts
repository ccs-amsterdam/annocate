import { describe, expect, it } from "vitest";

import { ExpressionCache } from "./expressionCache";
import { renderTemplate } from "./renderTemplate";

describe("renderTemplate", () => {
  it("substitutes known values", async () => {
    expect(await renderTemplate("# {{headline}}", { headline: "Big news" })).toBe("# Big news");
  });

  it("substitutes multiple expressions and coerces non-strings", async () => {
    expect(await renderTemplate("{{a}} and {{b}}", { a: 1, b: true })).toBe("1 and true");
  });

  it("replaces missing values with an empty string", async () => {
    expect(await renderTemplate("Hello {{missing}}!", {})).toBe("Hello !");
  });

  it("supports $unit.field in {{ expression }} syntax", async () => {
    expect(
      await renderTemplate("# {{$unit.headline}}\n\nAuthor: {{$unit.author}}", {
        $unit: { headline: "Breaking News", author: "Jane Doe" },
      }),
    ).toBe("# Breaking News\n\nAuthor: Jane Doe");
  });

  it("supports standalone $unit.field in template text", async () => {
    expect(
      await renderTemplate("# $unit.headline\n\n$unit.text", {
        $unit: { headline: "Direct Field", text: "Some content here" },
      }),
    ).toBe("# Direct Field\n\nSome content here");
  });

  it("evaluates real JS expressions, e.g. a conditional referencing layout constants", async () => {
    const values = { is_experiment: true, experiment_intro: "Experiment intro", control_intro: "Control intro" };
    expect(await renderTemplate("{{is_experiment ? experiment_intro : control_intro}}", values)).toBe(
      "Experiment intro",
    );
    expect(
      await renderTemplate("{{is_experiment ? experiment_intro : control_intro}}", { ...values, is_experiment: false }),
    ).toBe("Control intro");
  });

  it("leaves ::field/::tokenize directive syntax untouched, even with $unit. prefix", async () => {
    expect(
      await renderTemplate("# {{$unit.headline}}\n\n::tokenize[$unit.body]", {
        $unit: { headline: "Hi", body: "Tokens" },
      }),
    ).toBe("# Hi\n\n::tokenize[$unit.body]");
  });

  it("supports an optional ExpressionCache (design plan §12), still returning correct results", async () => {
    const cache = new ExpressionCache();
    expect(await renderTemplate("{{a}} and {{b}}", { a: 1, b: 2 }, cache)).toBe("1 and 2");
    // Same values -> cached slots reused, still correct.
    expect(await renderTemplate("{{a}} and {{b}}", { a: 1, b: 2 }, cache)).toBe("1 and 2");
    // A changed value -> that slot recomputed, still correct.
    expect(await renderTemplate("{{a}} and {{b}}", { a: 5, b: 2 }, cache)).toBe("5 and 2");
  });
});
