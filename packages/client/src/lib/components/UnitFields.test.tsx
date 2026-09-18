import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UnitLayout } from "@annotinder/contracts";
import { UnitFields } from "./UnitFields";

/**
 * Verifies the react-markdown + remark-directive + remarkUnitField pipeline
 * (design plan §11c) end-to-end: plain markdown, `{{column}}` substitution,
 * and the `::field[column]` directive's image/text rendering. Uses
 * `renderToStaticMarkup` (no DOM needed) rather than a full render, since
 * there's no `SpanAnnotationProvider` in scope here -- annotatable-text
 * rendering is covered separately by not being reachable outside a span
 * question (see JobRunner.tsx).
 */
describe("UnitFields", () => {
  const layout: UnitLayout = {
    template: "# {{headline}}\n\nSome intro text.\n\n::field[body]\n\n::field[photo]{as=\"image\"}",
  };

  it("renders headers, {{column}} substitution, plain markdown, and field directives", () => {
    const html = renderToStaticMarkup(
      <UnitFields layout={layout} data={{ headline: "Breaking News", body: "The article body.", photo: "https://example.com/a.png" }} />,
    );

    expect(html).toContain("Breaking News");
    expect(html).toContain("Some intro text.");
    expect(html).toContain("The article body.");
    expect(html).toContain('src="https://example.com/a.png"');
  });

  it("omits missing columns without crashing", () => {
    const html = renderToStaticMarkup(<UnitFields layout={{ template: "::field[missing]" }} data={{}} />);
    expect(html).not.toContain("undefined");
  });
});
