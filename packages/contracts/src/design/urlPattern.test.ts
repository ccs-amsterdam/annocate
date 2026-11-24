import { describe, expect, it } from "vitest";
import { matchesUrlPattern, urlPatternError } from "./urlPattern.js";
import { CoderParamSchema, UrlParamSchema } from "./session.js";

describe("URL parameter patterns", () => {
  it("match a value in full", () => {
    expect(matchesUrlPattern("5f2b9c0a1d3e4f5a6b7c8d9e", "[0-9a-f]{24}")).toBe(true);
    expect(matchesUrlPattern("5f2b9c0a1d3e4f5a6b7c8d9e!", "[0-9a-f]{24}")).toBe(false);
    expect(matchesUrlPattern("x5f2b9c0a1d3e4f5a6b7c8d9e", "[0-9a-f]{24}")).toBe(false);
    expect(matchesUrlPattern("b", "a|b|c")).toBe(true);
    expect(matchesUrlPattern("ab", "a|b|c")).toBe(false);
    expect(matchesUrlPattern("P00123", "P[0-9]{3,8}")).toBe(true);
    expect(matchesUrlPattern("data-set", "[a-z]+(-[a-z]+)?")).toBe(true);
    expect(matchesUrlPattern("12", "\\d+")).toBe(true);
    expect(matchesUrlPattern("", "\\d+")).toBe(false);
  });

  it("take time linear in the value, whatever the pattern", () => {
    const value = "a".repeat(256);
    for (const pattern of ["a*a*a*a*a*a*b", "(a+)+b", "(a|aa)*b", "(a*)*b", "([a-z]+)*x"]) {
      // The fastest of three runs: other tests run meanwhile
      const times = [1, 2, 3].map(() => {
        const start = Date.now();
        expect(matchesUrlPattern(value, pattern)).toBe(false);
        return Date.now() - start;
      });
      expect([pattern, Math.min(...times) < 50]).toEqual([pattern, true]);
    }
  });

  it("are refused when the engine doesn't support them", () => {
    for (const pattern of ["(a)\\1", "a(?=b)", "a(?!b)", "(", "[a-", "a{2,1}", "(?<name"])
      expect([pattern, urlPatternError(pattern)]).toEqual([pattern, "This pattern is not supported"]);
    for (const pattern of ["[0-9a-f]{24}", "a|b|c", "(a+)+", "(abc)?x", "(ab){2}", "[A-Za-z0-9_-]+"])
      expect([pattern, urlPatternError(pattern)]).toEqual([pattern, null]);
    expect(matchesUrlPattern("aa", "(a)\\1")).toBe(false);
  });

  it("are checked in a URL parameter and in the coder's parameter", () => {
    const issues = (schema: typeof UrlParamSchema | typeof CoderParamSchema, value: object) =>
      schema.safeParse(value).error?.issues.map((i) => i.message) ?? [];
    expect(issues(UrlParamSchema, { name: "panel", pattern: "(a)\\1" })).toEqual(["This pattern is not supported"]);
    expect(issues(CoderParamSchema, { param: "PID", pattern: "a(?=b)" })).toEqual(["This pattern is not supported"]);
    expect(issues(UrlParamSchema, { name: "panel", pattern: "a*a*a*a*a*a*b" })).toEqual([]);
    expect(issues(CoderParamSchema, { param: "PID", pattern: "[0-9a-f]{24}" })).toEqual([]);
  });
});
