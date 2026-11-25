import { describe, expect, it } from "vitest";
import {
  CrowdInviteSchema,
  coderKindProblem,
  designItems,
  firstInvite,
  inviteKind,
  inviteOf,
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
    expect(loginRequired(item({ invite: { mode: "crowd" } }))).toBe(false);
    expect(loginRequired(item({}))).toBe(false);
  });

  it("a crowd can't be required to sign in", () => {
    expect(CrowdInviteSchema.safeParse({ mode: "crowd", login: true }).success).toBe(false);
  });

  it("a design without an invitation hasn't chosen who codes", () => {
    expect(inviteOf(item({}))).toBeNull();
    expect(inviteOf(null)).toBeNull();
    expect(inviteOf(item({ invite: { mode: "crowd" } }))).toEqual({ mode: "crowd" });
  });
});

describe("the study's kind of coders and the invitation", () => {
  const item = (extra: Partial<SessionItem>): SessionItem => ({ type: "session", ...extra });
  const experts = item({ invite: { mode: "coders", link: "login" } });
  const crowd = item({ invite: { mode: "crowd", maxCoders: 5 } });

  it("an invitation is for one kind, and each kind has a first invitation", () => {
    expect(inviteKind(experts.invite!)).toBe("expert");
    expect(inviteKind(crowd.invite!)).toBe("crowd");
    expect(firstInvite("expert")).toEqual({ mode: "coders", link: "per_coder" });
    expect(firstInvite("crowd")).toEqual({ mode: "crowd" });
    expect(inviteKind(firstInvite("expert"))).toBe("expert");
  });

  it("an invitation for the study's kind is fine, and so is a design that hasn't chosen", () => {
    expect(coderKindProblem(experts, "expert")).toBeNull();
    expect(coderKindProblem(crowd, "crowd")).toBeNull();
    expect(coderKindProblem(item({}), "crowd")).toBeNull();
    expect(coderKindProblem(item({}), "expert")).toBeNull();
    expect(coderKindProblem(null, "expert")).toBeNull();
  });

  it("an invitation for the other kind is a problem", () => {
    expect(coderKindProblem(crowd, "expert")).toContain("This study has expert coders since its first deploy");
    expect(coderKindProblem(experts, "crowd")).toContain("This study has a crowd since its first deploy");
  });
});
