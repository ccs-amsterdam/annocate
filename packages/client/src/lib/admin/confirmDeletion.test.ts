import { describe, expect, it } from "vitest";
import type { AccountDeletion } from "@annotinder/contracts";
import { ResearcherApiError } from "../api/httpResearcherApi";
import { deletionError, deletionPlan, emailConfirmed, studyNameConfirmed } from "./confirmDeletion";

describe("typing a study's name to confirm deleting it", () => {
  it("is the exact name, apart from spaces around it", () => {
    expect(studyNameConfirmed("News 2026", "News 2026")).toBe(true);
    expect(studyNameConfirmed("  News 2026 ", "News 2026")).toBe(true);
  });

  it("is not part of the name, another case, or nothing", () => {
    expect(studyNameConfirmed("News", "News 2026")).toBe(false);
    expect(studyNameConfirmed("news 2026", "News 2026")).toBe(false);
    expect(studyNameConfirmed("", "News 2026")).toBe(false);
  });
});

describe("typing an email address to confirm deleting an account", () => {
  it("is the address, whatever its capitals and the spaces around it", () => {
    expect(emailConfirmed("ann@example.org", "ann@example.org")).toBe(true);
    expect(emailConfirmed(" Ann@Example.org ", "ann@example.org")).toBe(true);
  });

  it("is not another address or nothing", () => {
    expect(emailConfirmed("ann@example.com", "ann@example.org")).toBe(false);
    expect(emailConfirmed("", "ann@example.org")).toBe(false);
  });
});

describe("what deleting an account does", () => {
  const deletion: AccountDeletion = { email: "ann@example.org", studies: [], blocking: [], lastAdmin: false };

  it("is allowed when nothing keeps the account, with the studies that go with it", () => {
    const plan = deletionPlan({ ...deletion, studies: [{ id: 1, name: "Pilot" }] }, "own");
    expect(plan).toEqual({ allowed: true, studies: ["Pilot"], blockers: [] });
  });

  it("is not allowed while studies keep the account: each with what to do", () => {
    const plan = deletionPlan(
      {
        ...deletion,
        blocking: [
          { id: 2, name: "Team study", reason: "shared" },
          { id: 3, name: "Their study", reason: "last_admin" },
        ],
      },
      "own",
    );
    expect(plan.allowed).toBe(false);
    expect(plan.blockers).toHaveLength(2);
    expect(plan.blockers[0]).toMatch(/^Study "Team study": .*remove the other users first/);
    expect(plan.blockers[1]).toMatch(/^Study "Their study": .*only ADMIN/);
  });

  it("is not allowed for the server's only admin", () => {
    const plan = deletionPlan({ ...deletion, lastAdmin: true }, "own");
    expect(plan.allowed).toBe(false);
    expect(plan.blockers).toEqual([expect.stringContaining("only admin")]);
  });

  it("speaks of the user when an admin deletes someone else's account", () => {
    const blocking = [{ id: 2, name: "Team study", reason: "shared" as const }];
    expect(deletionPlan({ ...deletion, blocking }, "own").blockers[0]).toContain("you own it");
    expect(deletionPlan({ ...deletion, blocking }, "user").blockers[0]).toContain("they own it");
  });
});

describe("the message of a failed deletion", () => {
  const failed = (status: number, body: unknown) => new ResearcherApiError(status, `failed (${status})`, body);

  it("is the server's", () => {
    const error = failed(400, { error: "Type the study's name to confirm", code: "confirmation_mismatch" });
    expect(deletionError(error)).toBe("Type the study's name to confirm");
    expect(deletionError(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("is none for a step-up login, which the API client offers itself", () => {
    expect(deletionError(failed(403, { error: "Confirm it's you", code: "step_up_required" }))).toBeNull();
  });

  it("has the request id of an internal error, to report it with", () => {
    expect(deletionError(failed(500, { error: "Internal error", requestId: "abc123" }))).toBe(
      "Internal error (request id abc123)",
    );
  });
});
