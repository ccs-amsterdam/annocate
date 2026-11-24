import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignTreeView } from "./DesignTreeView";
import type { TopLevelItem } from "@annotinder/contracts";
import { ensureKeys } from "../../design/itemEdit";

describe("DesignTreeView", () => {
  // As in the editor: every item has a key (a loop has no name).
  const dummyItems: TopLevelItem[] = ensureKeys([
    { type: "session" },
    {
      type: "question",
      name: "consent",
      variable: { type: "confirm", question: "Do you agree?" },
    },
    {
      type: "unit_loop",
      id: "loop_1",
      label: "main_loop",
      children: [
        { type: "layout", template: "$unit.text" },
        {
          type: "question",
          name: "sentiment",
          variable: { type: "confirm", question: "Sentiment?" },
        },
      ],
    },
  ] as TopLevelItem[]);

  it("renders the items, with a + and a tick box per row", () => {
    const html = renderToStaticMarkup(
      <DesignTreeView
        items={dummyItems}
        selected="consent"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onAddElse={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    expect(html).toContain("consent");
    expect(html).toContain("main_loop");
    expect(html).toContain("sentiment");
    // consent, the loop, its layout and sentiment
    expect(html.match(/Add an item below/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Select consent"');
    // The main line from Start to the study's end; a question's answer type, a layout's fields
    expect(html).toContain(">Start<");
    expect(html).toContain("At the end");
    expect(html).toContain(">confirm<");
    expect(html).toMatch(/>text<\/span>/);
    // How to edit is behind the tree's info icon (TreePanel), not a line above the items
    expect(html).not.toContain("tick items to move or delete");
  });

  it("has no actions on a read-only codebook", () => {
    const html = renderToStaticMarkup(
      <DesignTreeView
        items={dummyItems}
        selected={null}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onAddElse={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        readOnly
      />,
    );
    expect(html).not.toContain("Add an item below");
    expect(html).not.toContain("checkbox");
  });
});
