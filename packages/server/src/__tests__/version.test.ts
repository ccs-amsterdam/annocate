import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RELEASE } from "@annotinder/contracts";
import { CLIENT_VERSION } from "../version.js";

describe("the release", () => {
  it("is every package's version (bumped together, docs/release-checklist.md)", () => {
    for (const dir of ["../../../..", "../../../contracts", "../../../server", "../../../client", "../../../e2e"]) {
      const pkg = JSON.parse(readFileSync(new URL(`${dir}/package.json`, import.meta.url), "utf8")) as { version: string };
      expect(pkg.version, dir).toBe(RELEASE);
    }
  });

  it("is what the server records, with a commit", () => {
    expect(CLIENT_VERSION.release).toBe(RELEASE);
    expect(CLIENT_VERSION.commit).not.toBe("");
  });
});
