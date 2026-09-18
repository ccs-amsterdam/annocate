import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UnitLayout } from "@annotinder/contracts";
import { UnitFields } from "./UnitFields";

/**
 * Verifies the react-markdown + remark-directive + remarkUnitField pipeline
 * (design plan §11c/§11f) end-to-end: plain markdown and the
 * `::field[name]` / `::tokenize[name]` directives' image/text/markdown
 * rendering, resolving against both unit data columns and layout
 * `constants`. `{{ expression }}` interpolation is NOT exercised here --
 * `JobManager.resolveUnitLayout` resolves it (via `renderTemplate`, async
 * QuickJS evaluation) before `layout.template` ever reaches this component,
 * so `UnitFields` itself only ever sees an already-resolved template (see
 * `renderTemplate.test.ts` for interpolation coverage). Uses
 * `renderToStaticMarkup` (no DOM needed) rather than a full render, since
 * there's no `SpanAnnotationProvider` in scope here -- annotatable-text
 * rendering is covered separately by not being reachable outside a span
 * question (see JobRunner.tsx).
 */
describe("UnitFields", () => {
  const layout: UnitLayout = {
    template:
      "# Breaking News\n\nSome intro text.\n\n::tokenize[body]\n\n::field[photo]{as=\"image\"}\n\n::field[note]{markdown=\"true\"}",
    constants: { note: "A **bold** note." },
  };

  it("renders headers, plain markdown, tokenize/field directives, and layout constants", () => {
    const html = renderToStaticMarkup(
      <UnitFields layout={layout} data={{ body: "The article body.", photo: "https://example.com/a.png" }} />,
    );

    expect(html).toContain("Breaking News");
    expect(html).toContain("Some intro text.");
    expect(html).toContain("The article body.");
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain("<strong>bold</strong>");
  });

  it("omits missing columns without crashing", () => {
    const html = renderToStaticMarkup(<UnitFields layout={{ template: "::tokenize[missing]" }} data={{}} />);
    expect(html).not.toContain("undefined");
  });
});
