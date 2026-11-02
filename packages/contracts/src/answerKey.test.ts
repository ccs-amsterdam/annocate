import { describe, expect, it } from "vitest";
import { answerKeyProblems, formatAnswerKey, matchesAnswerKey, parseAnswerKey } from "./answerKey.js";

describe("answer keys", () => {
  const matches = (cell: string, given: string[]) => matchesAnswerKey(parseAnswerKey(cell)!, given);

  it("are empty for empty cells", () => {
    expect(parseAnswerKey(null)).toBeNull();
    expect(parseAnswerKey("")).toBeNull();
    expect(parseAnswerKey(" | ")).toBeNull();
  });

  it("match exact values, sets in any order, alternatives and ranges", () => {
    expect(matches("positive", ["positive"])).toBe(true);
    expect(matches("positive", ["negative"])).toBe(false);
    expect(matches("a;b", ["b", "a"])).toBe(true);
    expect(matches("a;b", ["a"])).toBe(false);
    expect(matches("positive|neutral", ["neutral"])).toBe(true);
    expect(matches("a;b|c", ["c"])).toBe(true);
    expect(matches("3..5", ["4.5"])).toBe(true);
    expect(matches("3..5", ["6"])).toBe(false);
    expect(matches("5..3", ["3"])).toBe(true);
    expect(matches("-2..2", ["-1"])).toBe(true);
    expect(matches("3", ["3"])).toBe(true);
  });

  it("format back and list values that aren't options", () => {
    const key = parseAnswerKey(" a ; b | 1..2 ")!;
    expect(formatAnswerKey(key)).toBe("a;b|1..2");
    const nominal = { type: "nominal", options: [{ value: "a" }, { value: "c" }] };
    expect(answerKeyProblems(key, nominal)).toEqual(["b (not an option)", "1..2 (no option in this range)"]);
    expect(answerKeyProblems(key, undefined)).toEqual([]);
  });

  it("numbers compare as numbers; ranges suit ordered options and numeric questions", () => {
    expect(matchesAnswerKey(parseAnswerKey("3")!, ["3.0"])).toBe(true);
    const scale = { type: "ordinal", options: [1, 2, 3, 4, 5].map((value) => ({ value })) };
    expect(answerKeyProblems(parseAnswerKey("2..4|5")!, scale)).toEqual([]);
    expect(answerKeyProblems(parseAnswerKey("6..9")!, scale)).toEqual(["6..9 (no option in this range)"]);
    const numeric = { type: "numeric", min: 0, max: 10 };
    expect(answerKeyProblems(parseAnswerKey("3..5|7")!, numeric)).toEqual([]);
    expect(answerKeyProblems(parseAnswerKey("x|11|20..30")!, numeric)).toEqual(["x (not a number)", "11 (outside 0..10)", "20..30 (outside 0..10)"]);
  });
});
