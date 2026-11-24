import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReferenceScope } from "@annotinder/contracts";
import { renderTemplate } from "../codebook/renderTemplate";
import { RESIZE_SCRIPT, RESIZE_SCRIPT_HASH } from "@annotinder/contracts";
import { SandboxFrame } from "./SandboxedHtml";
import { FrameLoads, sandboxDocument } from "./sandboxDocument";
import { TemplateMarkdown } from "./TemplateMarkdown";

describe("SandboxedHtml", () => {
  it("allows exactly its own height script, by hash", async () => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(RESIZE_SCRIPT)));
    expect(RESIZE_SCRIPT_HASH).toBe(`sha256-${btoa(String.fromCharCode(...digest))}`);
  });

  it("puts the policy in the head, before the HTML", () => {
    const doc = sandboxDocument("<b>hi</b>");
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<b>hi</b>"));
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain(`script-src '${RESIZE_SCRIPT_HASH}'`);
  });

  it("renders ::html values in an iframe sandboxed without same-origin, styled like the app", async () => {
    const scope: ReferenceScope = { $unit: { body: "<p>Article</p>" }, $var: {} };
    const html = renderToStaticMarkup(<TemplateMarkdown rendered={await renderTemplate("$unit.body::html", scope)} />);
    expect(html).toContain('data-field="unit.body"');
    expect(html).not.toContain("<p>Article</p>"); // the frame is made in the browser, with the srcdoc escaped
    const look = { colorScheme: "dark", color: "rgb(1, 2, 3)", fontSize: "14px", primary: "teal", border: "gray" };
    const frame = renderToStaticMarkup(<SandboxFrame srcDoc={sandboxDocument("<p>Article</p>", look)} title="t" />);
    expect(frame).toContain('sandbox="allow-scripts"');
    expect(frame).not.toContain("<p>Article</p>");
    expect(sandboxDocument("<p>x</p>", look)).toMatch(/color-scheme:dark.*color:rgb\(1, 2, 3\).*<p>x<\/p>/);
  });

  it("tells a frame that left its document (a link, a meta refresh) from one given another document", () => {
    const loads = new FrameLoads();
    loads.show("light");
    loads.show("light");
    expect(loads.load()).toBe(false);
    // Another look: the frame loads its new document
    loads.show("dark");
    expect(loads.load()).toBe(false);
    // A load nobody asked for: the HTML sent the frame elsewhere
    expect(loads.load()).toBe(true);
  });
});
