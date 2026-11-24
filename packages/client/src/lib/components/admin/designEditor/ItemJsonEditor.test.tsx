import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DesignItem } from "@annotinder/contracts";
import { ItemJsonEditor } from "./ItemJsonEditor";

// What an edit of the text does is itemJson.ts (itemJson.test.ts); typing
// in the editor needs a browser (the e2e editor specs).
describe("ItemJsonEditor", () => {
  const layout = { _key: "y1", type: "layout", template: "$unit.text" } as unknown as DesignItem;

  it("shows the item's validation issues, and Format", () => {
    const issues = [{ path: ["template"], message: "Unknown unit field 'text'" }];
    const html = renderToStaticMarkup(
      <ItemJsonEditor item={layout} issues={issues} readOnly={false} onChange={vi.fn()} />,
    );
    expect(html).toContain("Format");
    expect(html).toContain("Unknown unit field");
    expect(html).not.toContain("Not applied");
  });

  it("can't be formatted when read only", () => {
    const html = renderToStaticMarkup(<ItemJsonEditor item={layout} issues={[]} readOnly onChange={vi.fn()} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Format/s);
  });
});
