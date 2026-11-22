import { describe, expect, it } from "vitest";
import {
  coderAccess,
  designItems,
  linkCombinations,
  loginRequired,
  sessionColumns,
  sessionItem,
  splitDesignItems,
  type SessionItem,
  type SessionSpec,
} from "./session.js";

describe("the design's Study entry (session and public info)", () => {
  const session: SessionSpec = {
    invite: { mode: "crowd", coderParam: { param: "PROLIFIC_PID" } },
    urlParams: [{ name: "wave", values: [{ value: "1" }, { value: "2" }] }],
  };
  const question = { type: "question", name: "q" };

  it("is the first item of the design's items, and comes out again", () => {
    const items = designItems({ items: [question], session, public: { title: "News" } });
    expect(items).toEqual([{ type: "session", ...session, public: { title: "News" } }, question]);
    expect(sessionItem(items)?.urlParams).toEqual(session.urlParams);
    expect(splitDesignItems(items)).toEqual({ items: [question], session, public: { title: "News" } });
  });

  it("is always there: without settings, an empty session and no public info", () => {
    expect(designItems({ items: [question] })).toEqual([{ type: "session" }, question]);
    expect(splitDesignItems([question])).toEqual({ items: [question], session: {}, public: null });
  });
});

describe("URL parameter patterns", () => {
  it("refuse patterns that could backtrack catastrophically", async () => {
    const { slowPattern } = await import("./session.js");
    for (const ok of [
      "[0-9a-f]{24}",
      "a|b|c",
      "[A-Za-z0-9_-]+",
      "P[0-9]{3,8}",
      "(abc)?x",
      "(ab){2}",
      "[a-z]+(-[a-z]+)?",
      "\\d+",
    ])
      expect(slowPattern(ok), ok).toBeNull();
    for (const bad of ["(a+)+", "(a|ab)*", "(a*)*", "([a-z]+)*x", "(a|b){2,}", "(x(a+))+", "(a)\\1"])
      expect(slowPattern(bad), bad).not.toBeNull();
  });
});

describe("coder unit assignments and links", () => {
  const setsOf = (group: string) =>
    ({ coder: ["anna", "bob"], emails: ["a@x.org", "b@x.org"], mixed: ["anna", "b@x.org"] })[group] ?? [];
  const item = (extra: Partial<SessionItem>): SessionItem => ({ type: "session", ...extra });

  it("tells email coders from named ones", () => {
    expect(coderAccess(["anna", "bob"])).toBe("link");
    expect(coderAccess(["a@x.org", "B@x.org"])).toBe("email");
    expect(coderAccess(["anna", "b@x.org"])).toBe("mixed");
    expect(coderAccess([])).toBe("none");
  });

  it("make a link per coder, or one link (a login, or a crowd)", () => {
    expect(linkCombinations(null, setsOf)).toEqual([{}]);
    expect(linkCombinations(item({ invite: { mode: "coders", column: "coder", link: "per_coder" } }), setsOf)).toEqual([
      { coder: "anna" },
      { coder: "bob" },
    ]);
    expect(linkCombinations(item({ invite: { mode: "coders", column: "emails", link: "login" } }), setsOf)).toEqual([
      {},
    ]);
    expect(linkCombinations(item({ invite: { mode: "crowd" } }), setsOf)).toEqual([{}]);
  });

  it("know which column selects a coder's units, and when coders sign in", () => {
    const coders = item({ invite: { mode: "coders", column: "coder", link: "per_coder" } });
    expect(sessionColumns(coders)).toEqual([{ name: "coder", column: "coder" }]);
    expect(sessionColumns(item({}))).toEqual([]);
    expect(loginRequired(coders)).toBe(false);
    expect(loginRequired(item({ invite: { mode: "coders", column: "emails", link: "login" } }))).toBe(true);
    expect(loginRequired(item({ invite: { mode: "crowd", login: true } }))).toBe(true);
    expect(loginRequired(item({}))).toBe(false);
  });
});
