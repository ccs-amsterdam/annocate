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
  const scope: ReferenceScope = { $unit: unit, $var: {} };
  return { layout, rendered: await renderTemplate(layout.template, scope, undefined, "t", { snippets: layout.snippets }) };
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

  it("renders ::markdown and ::image values, and snippets", async () => {
    const props = await render(
      {
        template: "Intro with [[note]] inline.\n\n$unit.body\n\n$unit.photo::image\n\n[[note]]",
        snippets: { note: "A **bold** note." },
      },
      { body: "The article body.", photo: "https://example.com/a.png" },
    );
    const html = renderToStaticMarkup(<UnitFields {...props} />);
    expect(html).toContain("<p>Intro with A <strong>bold</strong> note. inline.</p>");
    expect(html).toContain("The article body.");
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain("<p>A <strong>bold</strong> note.</p>");
  });

  it("shows a span question's field as the same selectable text during every question, selecting only during its own", async () => {
    const scope: ReferenceScope = { $unit: { body: "Some words here" }, $var: {} };
    const layout = { template: "$unit.body" };
    const rendered = await renderTemplate(layout.template, scope, undefined, "t", { selectable: ["unit.body"] });
    const during = (column: string) =>
      renderToStaticMarkup(
        <SpanAnnotationProvider fields={[column]} options={[{ value: "x" }]} initialSpans={[]}>
          <UnitFields layout={layout} rendered={rendered} />
        </SpanAnnotationProvider>,
      );
    expect(during("unit.body")).toContain(`tabindex="0"`);
    expect(during("")).not.toContain("tabindex");
    // The same element either way: nothing shifts between questions
    expect(during("").replace(/ tabindex="0"/g, "")).toBe(during("unit.body").replace(/ tabindex="0"/g, ""));
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

  it("shows a unit always light or dark with the layout's colorScheme", async () => {
    const light = renderToStaticMarkup(<UnitFields {...await render({ template: "x", colorScheme: "light" }, {})} />);
    expect(light).toMatch(/class="[^"]*\blight\b[^"]*bg-background/);
    const follow = renderToStaticMarkup(<UnitFields {...await render({ template: "x" }, {})} />);
    expect(follow).not.toMatch(/\b(light|dark)\b/);
  });
});
