import { describe, expect, it } from "vitest";
import type { CoderResponse, LinkResponse } from "@annotinder/contracts";
import {
  DEFAULT_CODER_SORT,
  coderColumns,
  codersOfKind,
  invitedKind,
  linkOfCoder,
  nextSort,
  sortCoders,
  unassignedText,
} from "./codersTable";

const coder = (id: string, extra: Partial<CoderResponse> = {}): CoderResponse => ({
  id: 1,
  coder: id,
  kind: "expert",
  email: null,
  created: new Date("2026-01-01"),
  assigned: 0,
  assignedDraft: 0,
  draftDiffers: false,
  done: 0,
  remaining: 0,
  sessions: 0,
  lastActive: null,
  ...extra,
});
const ids = (coders: CoderResponse[]) => coders.map((c) => c.coder);

describe("which coders the table shows", () => {
  it("those of the invitation: expert coders, else a crowd's (also before who codes is chosen)", () => {
    expect(invitedKind({ mode: "coders", link: "per_coder" })).toBe("expert");
    expect(invitedKind({ mode: "crowd" })).toBe("crowd");
    expect(invitedKind(null)).toBe("crowd");
    const coders = [coder("anna"), coder("P1", { kind: "crowd" }), coder("bob")];
    expect(ids(codersOfKind(coders, "expert"))).toEqual(["anna", "bob"]);
    expect(ids(codersOfKind(coders, "crowd"))).toEqual(["P1"]);
  });

  it("a crowd's coders have no address or units of their own: no columns for them", () => {
    expect(coderColumns("expert")).toEqual([
      "coder",
      "email",
      "assigned",
      "assignedDraft",
      "done",
      "remaining",
      "lastActive",
    ]);
    expect(coderColumns("crowd")).toEqual(["coder", "done", "lastActive"]);
  });
});

describe("the table's order", () => {
  const coders = [
    coder("carl", { remaining: 2, done: 8, email: "c@uni.nl", lastActive: new Date("2026-03-02") }),
    coder("Anna", { remaining: 10, done: 0, email: null, lastActive: null }),
    coder("bob", { remaining: 2, done: 3, email: "B@uni.nl", lastActive: new Date("2026-03-05") }),
  ];

  it("starts with who has the most left to do; equal coders by their id", () => {
    expect(DEFAULT_CODER_SORT).toEqual({ column: "remaining", descending: true });
    expect(ids(sortCoders(coders, DEFAULT_CODER_SORT))).toEqual(["Anna", "bob", "carl"]);
  });

  it("is by any column, both ways; texts ignore case", () => {
    expect(ids(sortCoders(coders, { column: "coder", descending: false }))).toEqual(["Anna", "bob", "carl"]);
    expect(ids(sortCoders(coders, { column: "coder", descending: true }))).toEqual(["carl", "bob", "Anna"]);
    expect(ids(sortCoders(coders, { column: "done", descending: false }))).toEqual(["Anna", "bob", "carl"]);
    expect(ids(sortCoders(coders, { column: "done", descending: true }))).toEqual(["carl", "bob", "Anna"]);
  });

  it("puts coders without a value last, whichever way", () => {
    expect(ids(sortCoders(coders, { column: "email", descending: false }))).toEqual(["bob", "carl", "Anna"]);
    expect(ids(sortCoders(coders, { column: "email", descending: true }))).toEqual(["carl", "bob", "Anna"]);
    expect(ids(sortCoders(coders, { column: "lastActive", descending: true }))).toEqual(["bob", "carl", "Anna"]);
    expect(ids(sortCoders(coders, { column: "lastActive", descending: false }))).toEqual(["carl", "bob", "Anna"]);
  });

  it("doesn't change the list it is given", () => {
    sortCoders(coders, { column: "coder", descending: false });
    expect(ids(coders)).toEqual(["carl", "Anna", "bob"]);
  });

  it("a click on the sorted column turns it round; another column starts A to Z, or highest first", () => {
    expect(nextSort(DEFAULT_CODER_SORT, "remaining")).toEqual({ column: "remaining", descending: false });
    expect(nextSort(DEFAULT_CODER_SORT, "coder")).toEqual({ column: "coder", descending: false });
    expect(nextSort(DEFAULT_CODER_SORT, "email")).toEqual({ column: "email", descending: false });
    expect(nextSort({ column: "coder", descending: false }, "done")).toEqual({ column: "done", descending: true });
    expect(nextSort({ column: "coder", descending: false }, "lastActive")).toEqual({
      column: "lastActive",
      descending: true,
    });
  });
});

describe("a coder's own link", () => {
  const link = (id: number, coderId: string, retiredAt: Date | null = null) =>
    ({ id, params: { coder: coderId }, retiredAt }) as unknown as LinkResponse;

  it("is the link the deployed design makes for them; not a retired one, not the study's one link", () => {
    const links = [link(1, "anna", new Date()), link(2, "anna"), link(3, "bob")];
    expect(linkOfCoder(links, "anna")?.id).toBe(2);
    expect(linkOfCoder(links, "carl")).toBeUndefined();
    expect(linkOfCoder([{ id: 4, params: {}, retiredAt: null } as unknown as LinkResponse], "anna")).toBeUndefined();
  });
});

describe("the notice about units without a coder", () => {
  it("says where they are: deployed, in the draft, or both", () => {
    const divide = "Divide them over the coders (Make coder set), then deploy the units.";
    expect(unassignedText({ live: 3, draft: 3 }, "expert")).toBe(
      `3 units have no coder, deployed and in the draft: nobody codes them. ${divide}`,
    );
    expect(unassignedText({ live: 3, draft: 1 }, "expert")).toBe(
      `3 units have no coder among the deployed units, and 1 in the draft: nobody codes them. ${divide}`,
    );
    expect(unassignedText({ live: 1, draft: 0 }, "expert")).toBe(
      "1 unit has no coder among the deployed units: nobody codes them. The draft gives every unit a coder: deploy the units to apply it.",
    );
    expect(unassignedText({ live: 0, draft: 2 }, "expert")).toBe(`2 units have no coder in the draft. ${divide}`);
    expect(unassignedText({ live: null, draft: 1 }, "expert")).toBe(`1 unit has no coder in the draft. ${divide}`);
  });

  it("isn't there when every unit has a coder, or for a crowd", () => {
    expect(unassignedText({ live: 0, draft: 0 }, "expert")).toBeNull();
    expect(unassignedText({ live: null, draft: 0 }, "expert")).toBeNull();
    expect(unassignedText({ live: 5, draft: 5 }, "crowd")).toBeNull();
  });
});
