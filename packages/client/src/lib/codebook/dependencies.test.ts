import { describe, expect, it } from "vitest";
import { extractDependencies } from "./dependencies";

describe("extractDependencies", () => {
  it("finds only the known names actually referenced in the script", () => {
    expect(extractDependencies("a + b", ["a", "b", "c"])).toEqual(["a", "b"]);
  });

  it("does not match substrings of longer identifiers", () => {
    expect(extractDependencies("abstract_long", ["abstract"])).toEqual([]);
  });

  it("ignores known names that aren't valid identifiers", () => {
    expect(extractDependencies("1foo", ["1foo"])).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(extractDependencies("true", ["a", "b"])).toEqual([]);
  });
});
