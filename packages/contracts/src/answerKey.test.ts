import { describe, expect, it } from "vitest";
import { formatAnswerKey, matchesAnswerKey, parseAnswerKey, unknownAnswerValues } from "./answerKey.js";

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
    expect(unknownAnswerValues(key, ["a", "c"])).toEqual(["b", "1..2"]);
    expect(unknownAnswerValues(key, undefined)).toEqual([]);
  });
});
