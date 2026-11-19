import { describe, expect, it } from "vitest";
import { coderAccess, designItems, linkCombinations, sessionColumns, sessionItem, splitDesignItems, type SessionItem, type SessionSpec } from "./session.js";

describe("the design's Study entry (session and public info)", () => {
  const session: SessionSpec = { params: [{ name: "part", kind: "link", values: { list: [{ value: "a" }, { value: "b" }] } }] };
  const question = { type: "question", name: "q" };

  it("is the first item of the design's items, and comes out again", () => {
    const items = designItems({ items: [question], session, public: { title: "News" } });
    expect(items).toEqual([{ type: "session", ...session, public: { title: "News" } }, question]);
    expect(sessionItem(items)?.params).toEqual(session.params);
    expect(splitDesignItems(items)).toEqual({ items: [question], session, public: { title: "News" } });
  });

  it("is always there: without settings, an empty session and no public info", () => {
    expect(designItems({ items: [question] })).toEqual([{ type: "session", params: [] }, question]);
    expect(splitDesignItems([question])).toEqual({ items: [question], session: { params: [] }, public: null });
  });
});

describe("URL parameter patterns", () => {
  it("refuse patterns that could backtrack catastrophically", async () => {
    const { slowPattern } = await import("./session.js");
    for (const ok of ["[0-9a-f]{24}", "a|b|c", "[A-Za-z0-9_-]+", "P[0-9]{3,8}", "(abc)?x", "(ab){2}", "[a-z]+(-[a-z]+)?", "\\d+"]) expect(slowPattern(ok), ok).toBeNull();
    for (const bad of ["(a+)+", "(a|ab)*", "(a*)*", "([a-z]+)*x", "(a|b){2,}", "(x(a+))+", "(a)\\1"]) expect(slowPattern(bad), bad).not.toBeNull();
  });
});

describe("links", () => {
  const setsOf = (group: string) => ({ coder: ["anna", "bob"], emails: ["a@x.org", "b@x.org"], mixed: ["anna", "b@x.org"], set: ["s1", "s2", "s3"] })[group] ?? [];
  const item = (extra: Partial<SessionItem>): SessionItem => ({ type: "session", params: [], ...extra });

  it("tells email coders (sign in, one link) from link coders (a link each)", () => {
    expect(coderAccess(["anna", "bob"])).toBe("link");
    expect(coderAccess(["a@x.org", "B@x.org"])).toBe("email");
    expect(coderAccess(["anna", "b@x.org"])).toBe("mixed");
    expect(coderAccess([])).toBe("none");
  });

  it("are one per coder (unless they sign in), per value of a condition assigned by link, and per link parameter value", () => {
    expect(linkCombinations(null, setsOf)).toEqual([{}]);
    expect(linkCombinations(item({ coders: { column: "coder" } }), setsOf)).toEqual([{ coder: "anna" }, { coder: "bob" }]);
    expect(linkCombinations(item({ coders: { column: "emails" } }), setsOf)).toEqual([{}]);
    const conditions: SessionItem["conditions"] = [
      { name: "framing", values: ["control", "experiment"], assign: "link", units: "framing" },
      { name: "set", values: "free", assign: "link", units: "set" },
      { name: "drawn", values: ["x", "y"], assign: "random" },
    ];
    const params: SessionItem["params"] = [{ name: "wave", kind: "link", values: { list: [{ value: "1" }, { value: "2" }] } }];
    const links = linkCombinations(item({ coders: { column: "coder" }, conditions, params }), setsOf);
    expect(links).toHaveLength(2 * 2 * 3 * 2);
    expect(links[0]).toEqual({ coder: "anna", framing: "control", set: "s1", wave: "1" });
    // Listed combinations limit the link parameters only
    expect(linkCombinations(item({ conditions: conditions.slice(0, 1), params, combinations: [{ wave: "2" }] }), setsOf)).toEqual([
      { framing: "control", wave: "2" },
      { framing: "experiment", wave: "2" },
    ]);
  });

  it("know which session values select units, by column", () => {
    const conditions: SessionItem["conditions"] = [
      { name: "framing", values: ["a"], assign: "link", units: "framing" },
      { name: "plain", values: ["a"], assign: "link" },
    ];
    expect(sessionColumns(item({ coders: { column: "coder" }, conditions }))).toEqual([
      { name: "coder", column: "coder" },
      { name: "framing", column: "framing" },
    ]);
  });
});
