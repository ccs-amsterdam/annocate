import { describe, expect, it } from "vitest";
import {
  CoderPatchSchema,
  CodersCreateSchema,
  CodersQuerySchema,
  coderIdProblem,
  coderInviteChecks,
  duplicateCoders,
  listedCoders,
  unknownCoders,
} from "./coder.js";

describe("an expert coder's id", () => {
  it("is a name, a number or an email address of 1 to 64 characters", () => {
    for (const id of ["anna", "Anna de Vries", "17", "anna@uni.nl", "x".repeat(64)])
      expect(coderIdProblem(id)).toBeNull();
  });

  it("isn't empty, longer than 64 characters, or padded with spaces", () => {
    expect(coderIdProblem("")).toMatch(/empty/);
    expect(coderIdProblem("x".repeat(65))).toMatch(/at most 64/);
    expect(coderIdProblem(" anna")).toMatch(/spaces at its ends/);
    expect(coderIdProblem("anna ")).toMatch(/spaces at its ends/);
  });

  it("has no control characters, and no ; or # (a coder_set cell's separators)", () => {
    expect(coderIdProblem("an\tna")).toMatch(/control characters/);
    expect(coderIdProblem("an\u0000na")).toMatch(/control characters/);
    expect(coderIdProblem("anna;bob")).toMatch(/; or #/);
    expect(coderIdProblem("anna#1")).toMatch(/; or #/);
  });
});

describe("creating expert coders", () => {
  it("takes ids, each with an email address or without", () => {
    const body = { coders: [{ coder: "anna", email: "anna@uni.nl" }, { coder: "bob" }] };
    expect(CodersCreateSchema.parse(body)).toEqual(body);
  });

  it("refuses an id that can't be one, an address that isn't one, and an empty list", () => {
    expect(CodersCreateSchema.safeParse({ coders: [{ coder: "a;b" }] }).success).toBe(false);
    expect(CodersCreateSchema.safeParse({ coders: [{ coder: "anna", email: "anna" }] }).success).toBe(false);
    expect(CodersCreateSchema.safeParse({ coders: [] }).success).toBe(false);
  });

  it("finds ids given twice, ignoring case, among themselves and against the existing coders", () => {
    expect(duplicateCoders(["anna", "bob", "Anna", "ANNA"])).toEqual(["Anna"]);
    expect(duplicateCoders(["anna", "carl"], ["Bob", "CARL"])).toEqual(["carl"]);
    expect(duplicateCoders(["anna", "bob"], ["carl"])).toEqual([]);
  });
});

describe("a coder's email address", () => {
  it("is set to an address or cleared", () => {
    expect(CoderPatchSchema.parse({ email: "anna@uni.nl" })).toEqual({ email: "anna@uni.nl" });
    expect(CoderPatchSchema.parse({ email: null })).toEqual({ email: null });
    expect(CoderPatchSchema.safeParse({ email: "anna" }).success).toBe(false);
    expect(CoderPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe("listing coders", () => {
  it("takes one kind of coder, and a list's pages", () => {
    expect(CodersQuerySchema.parse({ kind: "expert", limit: "10", after: "3" })).toEqual({
      kind: "expert",
      limit: 10,
      after: 3,
    });
    expect(CodersQuerySchema.safeParse({ kind: "panel" }).success).toBe(false);
  });
});

describe("the coders a coder set names", () => {
  it("are unknown unless they are expert coders, as written", () => {
    expect(unknownCoders(["anna", "bob", "bob", "Carl"], ["anna", "carl"])).toEqual(["bob", "Carl"]);
    expect(unknownCoders(["anna"], ["anna"])).toEqual([]);
  });

  it("are listed up to ten, then counted", () => {
    expect(listedCoders(["a", "b"])).toBe("a, b");
    const many = Array.from({ length: 13 }, (_, i) => `c${i}`);
    expect(listedCoders(many)).toBe("c0, c1, c2, c3, c4, c5, c6, c7, c8, c9 and 3 more");
  });
});

describe("what the invitation asks of the assigned coders", () => {
  const anna = { coder: "anna", email: "anna@uni.nl" };
  const bob = { coder: "bob", email: null };
  const carl = { coder: "carl@uni.nl", email: null };

  it("signing in: every assigned coder needs an email address; those without are named", () => {
    const checks = coderInviteChecks({ mode: "coders", link: "login" }, [anna, bob, carl]);
    expect(checks.errors).toHaveLength(1);
    expect(checks.errors[0]).toContain("these coders have none: bob, carl@uni.nl");
    expect(coderInviteChecks({ mode: "coders", link: "login" }, [anna]).errors).toEqual([]);
    expect(coderInviteChecks({ mode: "coders", link: "login" }, [anna, bob]).errors[0]).toContain(
      "this coder has none: bob",
    );
  });

  it("picking a name: a warning for ids that look like email addresses", () => {
    const checks = coderInviteChecks({ mode: "coders", link: "pick_name" }, [anna, carl]);
    expect(checks.errors).toEqual([]);
    expect(checks.warnings).toHaveLength(1);
    expect(checks.warnings[0]).toContain("this coder id looks like an email address: carl@uni.nl");
    expect(coderInviteChecks({ mode: "coders", link: "pick_name" }, [anna, bob]).warnings).toEqual([]);
  });

  it("a link each, or a crowd: nothing", () => {
    const nothing = { errors: [], warnings: [] };
    expect(coderInviteChecks({ mode: "coders", link: "per_coder" }, [bob, carl])).toEqual(nothing);
    expect(coderInviteChecks({ mode: "crowd" }, [bob, carl])).toEqual(nothing);
  });
});
