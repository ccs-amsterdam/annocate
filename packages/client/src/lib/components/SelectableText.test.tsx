import { describe, expect, it } from "vitest";
import { snapToWord, getWordAtPosition, truncateSpanText, SelectableText, mergeSpanSlices, toggleSliceRange } from "./SelectableText";
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

describe("getWordAtPosition", () => {
  const text = "Prime Minister Mark Rutte";

  it("finds whole word when clicking inside a word", () => {
    const range = getWordAtPosition(text, 8); // inside "Minister" (starts at 6, ends at 14)
    expect(range).toEqual([6, 14]);
    expect(text.slice(range![0], range![1])).toBe("Minister");
  });

  it("snaps to adjacent word when clicking boundary", () => {
    const range = getWordAtPosition(text, 0); // "P"
    expect(range).toEqual([0, 5]);
    expect(text.slice(range![0], range![1])).toBe("Prime");
  });

  it("returns null for out-of-bounds positions", () => {
    expect(getWordAtPosition(text, -1)).toBeNull();
    expect(getWordAtPosition(text, 999)).toBeNull();
  });
});

describe("truncateSpanText", () => {
  it("keeps short text untruncated", () => {
    expect(truncateSpanText("Mark Rutte", 20)).toBe("Mark Rutte");
  });

  it("truncates long text with an ellipsis in the middle", () => {
    const text = "European Central Bank President Christine Lagarde";
    const truncated = truncateSpanText(text, 25);
    expect(truncated).toContain("…");
    expect(truncated.startsWith("European Ce")).toBe(true);
    expect(truncated.endsWith("tine Lagarde")).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(25);
  });
});


describe("mergeSpanSlices", () => {
  const text = "The quick brown fox jumps over";

  it("merges overlapping and adjacent slices", () => {
    const merged = mergeSpanSlices(text, [
      { offset: 4, length: 5 },
      { offset: 10, length: 5 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ offset: 4, length: 11, text: "quick brown" });
  });

  it("preserves gaps between disjoint slices", () => {
    const merged = mergeSpanSlices(text, [
      { offset: 4, length: 5 },
      { offset: 16, length: 3 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ offset: 4, length: 5, text: "quick" });
    expect(merged[1]).toEqual({ offset: 16, length: 3, text: "fox" });
  });
});

describe("toggleSliceRange", () => {
  const text = "The quick brown fox jumps over the lazy dog";

  it("toggles on a new disjoint word slice", () => {
    const initial = [{ offset: 4, length: 5, text: "quick" }];
    const next = toggleSliceRange(text, initial, { offset: 16, length: 3 });
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ offset: 4, length: 5, text: "quick" });
    expect(next[1]).toEqual({ offset: 16, length: 3, text: "fox" });
  });

  it("toggles off an existing word slice", () => {
    const initial = [
      { offset: 4, length: 5, text: "quick" },
      { offset: 16, length: 3, text: "fox" },
    ];
    const next = toggleSliceRange(text, initial, { offset: 16, length: 3 });
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ offset: 4, length: 5, text: "quick" });
  });

  it("splits a continuous slice into two slices when toggling off a middle word", () => {
    const initial = [{ offset: 4, length: 15, text: "quick brown fox" }];
    const next = toggleSliceRange(text, initial, { offset: 10, length: 5 });
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ offset: 4, length: 5, text: "quick" });
    expect(next[1]).toEqual({ offset: 16, length: 3, text: "fox" });
  });

  it("merges two discontinuous slices when bridging the gap between them", () => {
    const initial = [
      { offset: 4, length: 5, text: "quick" },
      { offset: 16, length: 3, text: "fox" },
    ];
    const next = toggleSliceRange(text, initial, { offset: 10, length: 5 });
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ offset: 4, length: 15, text: "quick brown fox" });
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
      { id: "1", field: "text", code: "actor", slices: [{ offset: 4, length: 15, text: "quick brown fox" }] },
      { id: "2", field: "text", code: "color", slices: [{ offset: 10, length: 9, text: "brown fox" }] },
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

    // Marks for spans are rendered
    expect(html).toContain("<mark");
    expect(html).toContain("quick brown fox");
  });
});
