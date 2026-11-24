import { describe, expect, it } from "vitest";
import {
  coderAccess,
  designItems,
  linkCombinations,
  linkMaxCoders,
  loginRequired,
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

describe("who codes and links", () => {
  const coders = ["anna", "bob"];
  const item = (extra: Partial<SessionItem>): SessionItem => ({ type: "session", ...extra });

  it("tells email coders from named ones", () => {
    expect(coderAccess(["anna", "bob"])).toBe("link");
    expect(coderAccess(["a@x.org", "B@x.org"])).toBe("email");
    expect(coderAccess(["anna", "b@x.org"])).toBe("mixed");
    expect(coderAccess([])).toBe("none");
  });

  it("make a link per coder, or one link (a login, or a crowd)", () => {
    expect(linkCombinations(null, coders)).toEqual([{}]);
    expect(linkCombinations(item({ invite: { mode: "coders", link: "per_coder" } }), coders)).toEqual([
      { coder: "anna" },
      { coder: "bob" },
    ]);
    expect(linkCombinations(item({ invite: { mode: "coders", link: "per_coder" } }), [])).toEqual([]);
    expect(linkCombinations(item({ invite: { mode: "coders", link: "login" } }), coders)).toEqual([{}]);
    expect(linkCombinations(item({ invite: { mode: "crowd" } }), coders)).toEqual([{}]);
  });

  it("know a crowd link's most coders, and when coders sign in", () => {
    expect(linkMaxCoders(item({ invite: { mode: "crowd", maxCoders: 10 } }))).toBe(10);
    expect(linkMaxCoders(item({ invite: { mode: "coders", link: "per_coder" } }))).toBeUndefined();
    expect(loginRequired(item({ invite: { mode: "coders", link: "per_coder" } }))).toBe(false);
    expect(loginRequired(item({ invite: { mode: "coders", link: "login" } }))).toBe(true);
    expect(loginRequired(item({ invite: { mode: "crowd", login: true } }))).toBe(true);
    expect(loginRequired(item({}))).toBe(false);
  });
});
