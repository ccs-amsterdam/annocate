import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReferenceScope } from "@annotinder/contracts";
import { renderTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";

const scope: ReferenceScope = { $unit: { headline: "News" }, $var: {}, $const: {} };

describe("TemplateMarkdown blocks", () => {
  it("renders a style block as a styled element around its markdown, nested blocks nested", async () => {
    const rendered = await renderTemplate(
      ":::: style color: red\n# $unit.headline\n\n::: style font-size: 120%\nsome **text**\n:::\n::::\nafter",
      scope,
    );
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={rendered} />);
    expect(html).toBe(
      '<div style="color:red"><h1><span class="whitespace-pre-wrap">News</span></h1><div style="font-size:120%"><p>some <strong>text</strong></p></div></div>\n<p>after</p>',
    );
  });
});
