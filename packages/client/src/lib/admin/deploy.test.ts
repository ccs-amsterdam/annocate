import { describe, expect, it } from "vitest";
import { DEFAULT_REOPEN_MINUTES } from "@annotinder/contracts";
import type { DesignChange } from "../design/diff";
import { changeKeys, deployPanelKey, firstDeployReopenMinutes } from "./deploy";

describe("the deploy panel's key", () => {
  it("stays the same when the version's note is saved (a new revision)", () => {
    // Saving the note while deploying must not mount a new panel: it would lose "deploying" and the error
    const before = { id: 7, revision: 2 };
    const after = { id: 7, revision: 3 };
    expect(deployPanelKey(before)).toBe(deployPanelKey(after));
  });

  it("differs per version, and without one", () => {
    expect(deployPanelKey({ id: 7 })).not.toBe(deployPanelKey({ id: 8 }));
    expect(deployPanelKey(null)).not.toBe(deployPanelKey({ id: 7 }));
  });
});

describe("when coders finish, at the first deploy", () => {
  it("keeps what the study's Settings say", () => {
    expect(firstDeployReopenMinutes(120, true)).toBe(120);
    expect(firstDeployReopenMinutes(120, false)).toBe(120);
    expect(firstDeployReopenMinutes(null, true)).toBeNull();
  });

  it("for a study still on the default: closed after a day for a crowd, open for expert coders", () => {
    expect(firstDeployReopenMinutes(DEFAULT_REOPEN_MINUTES, true)).toBe(DEFAULT_REOPEN_MINUTES);
    expect(firstDeployReopenMinutes(DEFAULT_REOPEN_MINUTES, false)).toBeNull();
  });
});

describe("keys of the listed changes", () => {
  it("are unique for items without a name", () => {
    const branch: DesignChange = { kind: "added", name: "Branch", type: "branch", parent: null };
    const keys = changeKeys([branch, branch, { ...branch, kind: "removed" }]);
    expect(new Set(keys).size).toBe(3);
  });
});
