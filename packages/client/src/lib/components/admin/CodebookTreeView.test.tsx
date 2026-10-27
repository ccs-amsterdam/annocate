import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodebookTreeView } from "./CodebookTreeView";
import type { TopLevelItem } from "@annotinder/contracts";
import { ensureKeys } from "../../codebook/codebookEdit";

describe("CodebookTreeView", () => {
  // As in the editor: every item has a key (a loop has no name).
  const dummyItems: TopLevelItem[] = ensureKeys([
    {
      type: "question",
      name: "consent",
      variable: { type: "confirm", question: "Do you agree?" },
    },
    {
      type: "unit_loop",
      label: "main_loop",
      units: [{ mode: "all", unitset: "main" }],
      layout: { template: "text" },
      children: [
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
      <CodebookTreeView
        items={dummyItems}
        selected="consent"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    expect(html).toContain("consent");
    expect(html).toContain("main_loop");
    expect(html).toContain("sentiment");
    expect(html.match(/Add an item below/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Select consent"');
    expect(html).toContain("tick items to move or delete");
  });

  it("has no actions on a read-only codebook", () => {
    const html = renderToStaticMarkup(
      <CodebookTreeView items={dummyItems} selected={null} onSelect={vi.fn()} onAdd={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} readOnly />,
    );
    expect(html).not.toContain("Add an item below");
    expect(html).not.toContain("checkbox");
  });
});
