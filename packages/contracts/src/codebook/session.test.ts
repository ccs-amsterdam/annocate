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
