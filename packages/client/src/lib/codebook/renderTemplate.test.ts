import { describe, expect, it } from "vitest";

import { renderTemplate } from "./renderTemplate";

describe("renderTemplate", () => {
  it("substitutes known columns", () => {
    expect(renderTemplate("# {{headline}}", { headline: "Big news" })).toBe("# Big news");
  });

  it("substitutes multiple columns and coerces non-strings", () => {
    expect(renderTemplate("{{a}} and {{b}}", { a: 1, b: true })).toBe("1 and true");
  });

  it("replaces missing columns with an empty string", () => {
    expect(renderTemplate("Hello {{missing}}!", {})).toBe("Hello !");
  });
});
