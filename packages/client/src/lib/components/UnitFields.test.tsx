import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReferenceScope, UnitLayout } from "@annotinder/contracts";
import { renderTemplate } from "../codebook/renderTemplate";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { UnitFields } from "./UnitFields";

/**
 * The template pipeline end to end (docs/client.md §3): `renderTemplate`
 * evaluates the values, `UnitFields` renders the markdown with each value
 * by its suffix. Uses `renderToStaticMarkup` (no DOM needed).
 */
async function render(layout: UnitLayout, unit: Record<string, unknown>) {
  const scope: ReferenceScope = { $unit: unit, $var: {}, $const: layout.constants ?? {} };
  return { layout, rendered: await renderTemplate(layout.template, scope) };
}

describe("UnitFields", () => {
  it("renders values as plain text by default, so markdown in data stays literal", async () => {
    const props = await render({ template: "# $unit.headline\n\n$unit.text" }, { headline: "Hi *there*", text: "**x** <b>y</b>" });
    const html = renderToStaticMarkup(<UnitFields {...props} />);
    expect(html).toContain("<h1>");
    expect(html).toContain("Hi *there*");
    expect(html).toContain("**x** &lt;b&gt;y&lt;/b&gt;");
    expect(html).not.toContain("<strong>");
  });

  it("renders ::markdown, ::image and ::tokenize values, and constants", async () => {
    const props = await render(
      {
        template: "Intro with $const.note::markdown inline.\n\n$unit.body::tokenize\n\n$unit.photo::image\n\n$const.note::markdown",
        constants: { note: "A **bold** note." },
      },
      { body: "The article body.", photo: "https://example.com/a.png" },
    );
    const html = renderToStaticMarkup(<UnitFields {...props} />);
    expect(html).toContain("<p>Intro with <span>A <strong>bold</strong> note.</span> inline.</p>");
    expect(html).toContain("The article body.");
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain("<div><p>A <strong>bold</strong> note.</p></div>");
  });

  it("makes the tokenized field selectable for the span question that targets it", async () => {
    const props = await render({ template: "$unit.body::tokenize" }, { body: "Some words here" });
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider column="body" options={[{ value: "x" }]} initialSpans={[]}>
        <UnitFields {...props} />
      </SpanAnnotationProvider>,
    );
    expect(html).toContain("Some");
    expect(html).toContain(`tabindex="0"`);
  });

  it("fills in values in link URLs, and doesn't eat colons in text", async () => {
    const props = await render({ template: "[source]($unit.url) at 10:30, note:this" }, { url: "https://example.com" });
    const html = renderToStaticMarkup(<UnitFields {...props} />);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("at 10:30, note:this");
  });

  it("leaves refs in code spans literal, and omits missing values", async () => {
    const props = await render({ template: "`$unit.a` and [$unit.missing]" }, { a: "A" });
    const html = renderToStaticMarkup(<UnitFields {...props} />);
    expect(html).toContain("<code>$unit.a</code>");
    expect(html).not.toContain("undefined");
  });
});
