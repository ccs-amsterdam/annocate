import { describe, expect, it } from "vitest";
import { snapToWord, SelectableText } from "./SelectableText";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { renderToStaticMarkup } from "react-dom/server";
import type { SpanAnswer } from "@annotinder/contracts";

describe("snapToWord", () => {
  const text = "The quick brown fox jumps over the lazy dog.";

  it("snaps partial selection inside a single word to the whole word", () => {
    // "quick" starts at index 4, ends at 9
    const [start, end] = snapToWord(text, 5, 8); // "uic"
    expect(start).toBe(4);
    expect(end).toBe(9);
    expect(text.slice(start, end)).toBe("quick");
  });

  it("snaps across multiple words to boundary of first and last word", () => {
    // "brown fox" starts at 10, ends at 19
    const [start, end] = snapToWord(text, 12, 17); // "own f"
    expect(start).toBe(10);
    expect(end).toBe(19);
    expect(text.slice(start, end)).toBe("brown fox");
  });

  it("trims whitespace from boundaries", () => {
    const textWithSpaces = "  hello   world  ";
    const [start, end] = snapToWord(textWithSpaces, 1, 15);
    expect(textWithSpaces.slice(start, end)).toBe("hello   world");
  });

  it("handles empty or zero-length range gracefully", () => {
    const [start, end] = snapToWord(text, 5, 5);
    expect(start).toBe(5);
    expect(end).toBe(5);
  });
});

describe("SelectableText and SpanAnnotationProvider", () => {
  it("renders non-overlapping text when no spans exist", () => {
    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="headline"
        codes={[{ code: "actor", color: "#2196f3" }]}
      >
        <SelectableText text="Sample headline text" />
      </SpanAnnotationProvider>,
    );

    expect(html).toContain("Sample headline text");
  });

  it("renders multiple overlapping spans on the same piece of text", () => {
    const initialSpans: SpanAnswer[] = [
      { id: "1", field: "text", offset: 4, length: 15, code: "actor", text: "quick brown fox" },
      { id: "2", field: "text", offset: 10, length: 9, code: "color", text: "brown fox" },
    ];

    const html = renderToStaticMarkup(
      <SpanAnnotationProvider
        column="text"
        codes={[
          { code: "actor", color: "#2196f3" },
          { code: "color", color: "#ff9800" },
        ]}
        initialSpans={initialSpans}
      >
        <SelectableText text="The quick brown fox jumps" />
      </SpanAnnotationProvider>,
    );

    // Both single mark and multi-span overlapping mark are rendered
    expect(html).toContain("<mark");
    expect(html).toContain("actor");
    expect(html).toContain("color");
  });
});
