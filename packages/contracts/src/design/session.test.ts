import { describe, expect, it } from "vitest";
import { designItems, sessionItem, splitSession, type SessionSpec } from "./session.js";

describe("the design's session", () => {
  const session: SessionSpec = { params: [{ name: "part", kind: "link", values: { list: [{ value: "a" }, { value: "b" }] } }] };
  const question = { type: "question", name: "q" };

  it("is the first item of the design's items, and comes out again", () => {
    const items = designItems({ items: [question], session });
    expect(items).toEqual([{ type: "session", ...session }, question]);
    expect(sessionItem(items)?.params).toEqual(session.params);
    expect(splitSession(items)).toEqual({ items: [question], session });
  });

  it("is absent without one", () => {
    expect(designItems({ items: [question], session: null })).toEqual([question]);
    expect(splitSession([question])).toEqual({ items: [question], session: null });
  });
});

describe("URL parameter patterns", () => {
  it("refuse patterns that could backtrack catastrophically", async () => {
    const { slowPattern } = await import("./session.js");
    for (const ok of ["[0-9a-f]{24}", "a|b|c", "[A-Za-z0-9_-]+", "P[0-9]{3,8}", "(abc)?x", "(ab){2}", "[a-z]+(-[a-z]+)?", "\\d+"]) expect(slowPattern(ok), ok).toBeNull();
    for (const bad of ["(a+)+", "(a|ab)*", "(a*)*", "([a-z]+)*x", "(a|b){2,}", "(x(a+))+", "(a)\\1"]) expect(slowPattern(bad), bad).not.toBeNull();
  });
});
