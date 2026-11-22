import { describe, expect, it } from "vitest";
import { textSegments, wordRanges, wordsSlice } from "./spanText";

describe("the keyboard's words", () => {
  const text = "Anna de Wit,  the mayor.";

  it("are the runs of non-space characters", () => {
    expect(wordRanges(text).map(([a, b]) => text.slice(a, b))).toEqual(["Anna", "de", "Wit,", "the", "mayor."]);
    expect(wordRanges("  ")).toEqual([]);
  });

  it("make a selection from one word to another, either way", () => {
    const words = wordRanges(text);
    expect(wordsSlice(text, words, 0, 2)).toEqual({ offset: 0, length: 12, text: "Anna de Wit," });
    expect(wordsSlice(text, words, 4, 3)).toEqual({ offset: 14, length: 10, text: "the mayor." });
  });

  it("are cut out of the text's segments, to mark the word the keyboard is on", () => {
    expect(textSegments(text, [], null, [5, 7]).map((s) => text.slice(s.start, s.end))).toEqual([
      "Anna ",
      "de",
      " Wit,  the mayor.",
    ]);
  });
});
