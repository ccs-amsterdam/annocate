import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReferenceScope } from "@annotinder/contracts";
import { renderTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";

const scope: ReferenceScope = { $unit: { headline: "News" }, $var: {} };

describe("TemplateMarkdown blocks", () => {
  it("renders a style block as a styled element around its markdown, nested blocks nested", async () => {
    const rendered = await renderTemplate(
      ":::: style color: red\n# $unit.headline\n\n::: style font-size: 120%\nsome **text**\n:::\n::::\nafter",
      scope,
    );
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={rendered} />);
    expect(html).toBe(
      '<div class="flex flex-col gap-4" style="color:red"><h1><span class="whitespace-pre-wrap" data-field="unit.headline">News</span></h1><div class="flex flex-col gap-4" style="font-size:120%"><p>some <strong>text</strong></p></div></div>\n<p>after</p>',
    );
  });

  it("marks the elements of unit fields with data-field, every time a field is used", async () => {
    const rendered = await renderTemplate("# $unit.headline\n\n$unit.headline\n\n{{ $unit.headline }}", scope);
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={rendered} />);
    expect(html.match(/data-field="unit.headline"/g)).toHaveLength(3);
  });

  it("renders the blocks of a snippet", async () => {
    const snippets = { banner: "::: style color: blue; font-size: 90%\n> **Experiment group.** A banner.\n:::" };
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={await renderTemplate("[[banner]]", scope, undefined, "t", { snippets })} />);
    expect(html).toContain('<div class="flex flex-col gap-4" style="color:blue;font-size:90%"><blockquote>');
    expect(html).toContain("<strong>Experiment group.</strong>");
    expect(html).not.toContain(":::");
  });


  it("shows typed blocks as one value of their kind, values put in as they are, marked with their name", async () => {
    const s: ReferenceScope = { $unit: { headline: "News", text: "about climate" }, $var: {} };
    const template = [
      "::: markdown intro",
      "**$unit.headline**: {{ $unit.text.replace('climate', '*climate*') }}",
      ":::",
      "{{ $unit.text.toUpperCase() }}::markdown",
      "::: text summary",
      "{{ $unit.text.slice(0, 5) }}",
      ":::",
    ].join("\n");
    const rendered = await renderTemplate(template, s, undefined, "t", { selectable: ["summary"] }); // not a unit field: never selectable
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={rendered} />);
    expect(html).toContain('<div data-field="intro"><p><strong>News</strong>: about <em>climate</em></p></div>');
    expect(html).toContain("ABOUT CLIMATE");
    expect(rendered.values.at(-1)).toEqual({ suffix: "text", text: "about", block: true, field: "summary" });
  });
});

