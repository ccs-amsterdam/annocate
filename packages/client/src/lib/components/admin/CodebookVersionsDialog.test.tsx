import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodebookVersionsView } from "./CodebookVersionsDialog";
import type { CodebookMeta } from "@annotinder/contracts";

describe("CodebookVersionsDialog", () => {
  const mockCodebooks: CodebookMeta[] = [
    {
      id: 1,
      name: "Initial Codebook",
      created: new Date("2026-09-01T10:00:00Z"),
      immutable: true,
    },
    {
      id: 2,
      name: "Sentiment and Actors",
      created: new Date("2026-09-15T14:30:00Z"),
      immutable: false,
    },
  ];

  it("renders versions, timestamps, active status, immutability, and provenance explanation", () => {
    const html = renderToStaticMarkup(
      <CodebookVersionsView
        codebooks={mockCodebooks}
        currentVersion={2}
        latestCodebookId={2}
        onSelectVersion={vi.fn()}
        onCreateNewVersion={vi.fn()}
        onDuplicateVersion={vi.fn()}
      />,
    );

    // Provenance explanation
    expect(html).toContain("About Codebook Versions &amp; Provenance");
    expect(html).toContain("one active version");
    expect(html).toContain("immutable");

    // Version items
    expect(html).toContain("Initial Codebook");
    expect(html).toContain("Sentiment and Actors");

    // Status badges
    expect(html).toContain("Active Version");
    expect(html).toContain("Immutable");
    expect(html).toContain("Draft");
    expect(html).toContain("In Editor");
  });
});
