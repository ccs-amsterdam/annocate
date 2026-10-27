import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodebookVersionsView } from "./CodebookVersionsDialog";
import type { CodebookMeta } from "@annotinder/contracts";
import { describeVersions } from "../../codebook/versions";

describe("CodebookVersionsDialog", () => {
  const mockCodebooks: CodebookMeta[] = [
    {
      id: 1,
      note: "Initial Codebook",
      created: new Date("2026-09-01T10:00:00Z"),
      immutable: true,
      updated: new Date(),
      updatedBy: null,
      revision: 1,
      valid: true,
    },
    {
      id: 2,
      note: null,
      created: new Date("2026-09-15T14:30:00Z"),
      immutable: false,
      updated: new Date(),
      updatedBy: null,
      revision: 1,
      valid: true,
    },
  ];

  it("renders versions with their live/draft status and the explanation", () => {
    const html = renderToStaticMarkup(
      <CodebookVersionsView
        codebooks={mockCodebooks}
        versions={describeVersions(mockCodebooks, 1)}
        openId={2}
        onView={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(html).toContain("Coders use the");
    expect(html).toContain("v1");
    expect(html).toContain("Initial Codebook");
    expect(html).toContain("v2");
    expect(html).toContain("Live");
    expect(html).toContain("Draft");
    expect(html).toContain("In editor");
    // Only the live version can be restored; the draft is edited directly
    expect(html.match(/Restore as draft/g)).toHaveLength(1);
  });
});
