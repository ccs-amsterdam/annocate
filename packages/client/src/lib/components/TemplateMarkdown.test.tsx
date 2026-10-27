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
      '<div style="color:red"><h1><span class="whitespace-pre-wrap" data-field="headline">News</span></h1><div style="font-size:120%"><p>some <strong>text</strong></p></div></div>\n<p>after</p>',
    );
  });

  it("marks the elements of unit fields with data-field, every time a field is used", async () => {
    const rendered = await renderTemplate("# $unit.headline\n\n$unit.headline\n\n{{ $unit.headline }}", scope);
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={rendered} />);
    expect(html.match(/data-field="headline"/g)).toHaveLength(3);
  });

  it("renders the blocks of a snippet", async () => {
    const snippets = { banner: "::: style color: blue; font-size: 90%\n> **Experiment group.** A banner.\n:::" };
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={await renderTemplate("$snippet.banner", scope, undefined, "t", { snippets })} />);
    expect(html).toContain('<div style="color:blue;font-size:90%"><blockquote>');
    expect(html).toContain("<strong>Experiment group.</strong>");
    expect(html).not.toContain(":::");
  });

});
