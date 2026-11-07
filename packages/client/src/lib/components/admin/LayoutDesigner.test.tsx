import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutDesigner } from "./LayoutDesigner";

const fields = ["headline", "source", "text", "views"];
const types = { headline: "text", source: "text", text: "text", views: "number" } as const;

describe("LayoutDesigner", () => {
  it("starts as an empty document: the places' placeholders, and every field to place", () => {
    const html = renderToStaticMarkup(<LayoutDesigner layout={{ body: [] }} fields={fields} types={types} onChange={() => {}} />);
    for (const place of ["Title", "Byline", "Body"]) expect(html).toContain(`aria-label="${place}: choose a field"`);
    for (const f of fields) expect(html).toContain(`aria-label="Add ${f} to the body"`);
    expect(html).toContain("click to add to the body, or drag onto a place");
  });

  it("shows placed fields in their places, and only the others in the list", () => {
    const html = renderToStaticMarkup(
      <LayoutDesigner layout={{ title: "headline", body: ["text"] }} fields={fields} types={types} onChange={() => {}} />,
    );
    expect(html).toContain('aria-label="Title: headline"');
    expect(html).toContain('aria-label="Body: text"');
    expect(html).toContain('aria-label="Byline: choose a field"');
    expect(html).not.toContain('aria-label="Add headline to the body"');
    expect(html).not.toContain('aria-label="Add text to the body"');
    expect(html).toContain('aria-label="Add views to the body"');
    // The body has more to add: its last place adds
    expect(html).toContain('aria-label="Body: add a field"');
  });

  it("says when every field is shown", () => {
    const html = renderToStaticMarkup(
      <LayoutDesigner layout={{ title: "headline", byline: "source", body: ["text", "views"] }} fields={fields} onChange={() => {}} />,
    );
    expect(html).toContain("Every unit field is shown");
    expect(html).not.toContain("Body: add a field");
  });
});
