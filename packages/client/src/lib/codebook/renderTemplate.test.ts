import { describe, expect, it } from "vitest";

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

  it("evaluates real JS expressions, e.g. a conditional referencing layout constants", async () => {
    const values = { is_experiment: true, experiment_intro: "Experiment intro", control_intro: "Control intro" };
    expect(await renderTemplate("{{is_experiment ? experiment_intro : control_intro}}", values)).toBe(
      "Experiment intro",
    );
    expect(
      await renderTemplate("{{is_experiment ? experiment_intro : control_intro}}", { ...values, is_experiment: false }),
    ).toBe("Control intro");
  });

  it("leaves ::field/::tokenize directive syntax untouched", async () => {
    expect(await renderTemplate("# {{headline}}\n\n::tokenize[body]", { headline: "Hi" })).toBe(
      "# Hi\n\n::tokenize[body]",
    );
  });
});
