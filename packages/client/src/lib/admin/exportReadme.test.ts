import { describe, expect, it } from "vitest";
import { CSV_FORMULA_ADVICE, CSV_FORMULA_WARNING, readme } from "./exportReadme";

const at = new Date("2026-11-20T10:00:00Z");

describe("the download's README", () => {
  it("warns that CSV cells are as typed, and that a spreadsheet runs formulas", () => {
    const text = readme("Framing", at, true, "csv");
    expect(text).toContain(`WARNING: ${CSV_FORMULA_WARNING}`);
    expect(text).toContain(CSV_FORMULA_ADVICE);
    expect(CSV_FORMULA_WARNING).toContain("=, +, - or @");
  });

  it("as Excel: no warning, the cells are never formulas", () => {
    const text = readme("Framing", at, true, "xlsx");
    expect(text).not.toContain("WARNING");
    expect(text).toContain("never run as formulas");
  });

  it("names every file of the download", () => {
    const text = readme("Framing", at, false);
    for (const file of [
      "annotations.csv",
      "coders.csv",
      "units.csv",
      "variables.csv",
      "designs/v<n>.json",
      "display_changes.csv",
      "devices.csv",
      "timings.csv",
      "deleted_coders.csv",
      "reset_answers.csv",
    ])
      expect(text).toContain(file);
  });
});
