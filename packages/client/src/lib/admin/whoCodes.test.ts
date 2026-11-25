import { describe, expect, it } from "vitest";
import type { CoderResponse, Invite } from "@annotinder/contracts";
import { deployDeletesText, unusedExperts, unusedExpertsText, whoCodes } from "./whoCodes";

const design = (invite?: Invite) => ({ session: invite ? { invite } : {} });
const EXPERTS: Invite = { mode: "coders", link: "per_coder" };
const CROWD: Invite = { mode: "crowd" };

const coder = (coder: string, kind: CoderResponse["kind"], email: string | null = null): CoderResponse => ({
  id: 1,
  coder,
  kind,
  email,
  created: new Date(0),
  assigned: null,
  assignedDraft: null,
  draftDiffers: false,
  done: 0,
  remaining: null,
  sessions: 0,
  lastActive: null,
});

describe("whoCodes", () => {
  it("before the first deploy: the kind the draft design invites, not fixed", () => {
    expect(whoCodes({ coderKind: null }, design(EXPERTS))).toEqual({ kind: "expert", locked: false });
    expect(whoCodes({ coderKind: null }, design(CROWD))).toEqual({ kind: "crowd", locked: false });
  });

  it("no design yet, or one without an invitation: not chosen", () => {
    expect(whoCodes({ coderKind: null }, null)).toEqual({ kind: null, locked: false });
    expect(whoCodes({ coderKind: null }, undefined)).toEqual({ kind: null, locked: false });
    expect(whoCodes({ coderKind: null }, design())).toEqual({ kind: null, locked: false });
  });

  it("after the first deploy: the study's kind, whatever a draft says", () => {
    expect(whoCodes({ coderKind: "crowd" }, design(EXPERTS))).toEqual({ kind: "crowd", locked: true });
    expect(whoCodes({ coderKind: "expert" }, design())).toEqual({ kind: "expert", locked: true });
  });
});

describe("expert coders a design doesn't use", () => {
  const coders = [coder("anna", "expert", "anna@example.org"), coder("bob", "expert"), coder("P1", "crowd")];

  it("are all expert coders when the design invites a crowd or hasn't chosen, none when it invites them", () => {
    expect(unusedExperts(coders, "crowd").map((c) => c.coder)).toEqual(["anna", "bob"]);
    expect(unusedExperts(coders, null).map((c) => c.coder)).toEqual(["anna", "bob"]);
    expect(unusedExperts(coders, "expert")).toEqual([]);
    expect(unusedExperts([coder("P1", "crowd")], "crowd")).toEqual([]);
  });

  it("are named with their number, and their email addresses when they have any", () => {
    expect(unusedExpertsText([])).toBeNull();
    expect(unusedExpertsText(unusedExperts(coders, "crowd"))).toBe(
      "2 expert coders (with email addresses) aren't used by this design",
    );
    expect(unusedExpertsText([coder("anna", "expert", "anna@example.org")])).toBe(
      "1 expert coder (with an email address) isn't used by this design",
    );
    expect(unusedExpertsText([coder("bob", "expert"), coder("carl", "expert")])).toBe(
      "2 expert coders aren't used by this design",
    );
  });

  it("are announced before a crowd's first deploy deletes them", () => {
    expect(deployDeletesText([])).toBeNull();
    expect(deployDeletesText([coder("a", "expert"), coder("b", "expert"), coder("c", "expert")])).toBe(
      "3 expert coders aren't used and will be deleted",
    );
    expect(deployDeletesText([coder("a", "expert")])).toBe("1 expert coder isn't used and will be deleted");
  });
});
