import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TopLevelItem } from "@annotinder/contracts";
import { CodebookJsonEditor, getFoldableLineNumbers } from "./CodebookJsonEditor";
import { formatJson } from "../../codebook/jsonFormat";

describe("CodebookJsonEditor", () => {
  const items = [
    { type: "question", name: "consent", variable: { type: "confirm", question: "Do you agree?" } },
    {
      type: "unit_loop",
      name: "loop",
      units: [{ mode: "all", unitset: "__all__" }],
      layout: { template: "# $unit.headline\n\n$unit.text::tokenize", constants: { intro: "Hi" } },
      children: [{ type: "question", name: "q", variable: { type: "nominal", question: "Long enough question text to break the line?", options: [{ value: "a" }] } }],
    },
  ] as unknown as TopLevelItem[];

  it("renders its controls", () => {
    const html = renderToStaticMarkup(<CodebookJsonEditor items={items} onChange={vi.fn()} />);
    expect(html).toContain("Fold details");
    expect(html).toContain("Unfold all");
    expect(html).toContain("Format");
  });

  it("finds the variable and layout objects to fold", () => {
    const text = formatJson(items);
    const lines = text.split("\n");
    const folds = getFoldableLineNumbers(text).map((n) => lines[n - 1].trim());
    expect(folds).toEqual(['"layout": {', '"variable": {']);
  });
});
