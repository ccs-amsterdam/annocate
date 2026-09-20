import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodebookTreeView } from "./CodebookTreeView";
import type { TopLevelItem } from "@annotinder/contracts";

describe("CodebookTreeView", () => {
  const dummyItems: TopLevelItem[] = [
    {
      type: "user_variable",
      name: "consent",
      variable: { type: "confirm", question: "Do you agree?" },
    },
    {
      type: "unit_loop",
      name: "main_loop",
      unitset: "main",
      layout: { template: "text" },
      children: [
        {
          type: "unit_variable",
          name: "sentiment",
          variable: { type: "confirm", question: "Sentiment?" },
        },
      ],
    },
  ];

  it("renders tree items with Move button and icons without throwing", () => {
    const onSelect = vi.fn();
    const onAddChild = vi.fn();
    const onDelete = vi.fn();
    const onMoveItem = vi.fn();

    const html = renderToStaticMarkup(
      <CodebookTreeView
        items={dummyItems}
        selected="consent"
        onSelect={onSelect}
        onAddChild={onAddChild}
        onDelete={onDelete}
        onMoveItem={onMoveItem}
      />,
    );

    expect(html).toContain("consent");
    expect(html).toContain("main_loop");
    expect(html).toContain("sentiment");
    expect(html).toContain("Move item");
  });
});
