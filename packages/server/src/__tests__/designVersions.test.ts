import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as contracts from "@annotinder/contracts";
import { toDesignVersionMeta, type DesignVersionRow } from "../shared/designVersions.js";
import { sessionValues } from "../runtime/sessionValues.js";

// How often a design was validated
const validations = vi.hoisted(() => ({ count: 0 }));
vi.mock("@annotinder/contracts", async (original) => {
  const actual = await original<typeof contracts>();
  const designErrors: typeof actual.designErrors = (...args) => {
    validations.count++;
    return actual.designErrors(...args);
  };
  return { ...actual, designErrors };
});

const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });

function row(overrides: Partial<DesignVersionRow>): DesignVersionRow {
  return {
    id: 1,
    studyId: 1,
    note: null,
    formatVersion: 1,
    items: [question("q")],
    session: {},
    units: { fields: [] },
    immutable: false,
    revision: 1,
    created: new Date(1000),
    updated: new Date(1000),
    updatedBy: null,
    public: null,
    ...overrides,
  };
}

describe("whether a design version is valid", () => {
  beforeEach(() => {
    validations.count = 0;
  });

  it("is found once per revision, not every time the version is listed", () => {
    const first = row({ id: 7001 });
    expect(toDesignVersionMeta(first).valid).toBe(true);
    expect(toDesignVersionMeta({ ...first }).valid).toBe(true);
    expect(validations.count).toBe(1);

    // Saved again: a new revision, now with a name used twice
    const saved = row({ id: 7001, revision: 2, updated: new Date(2000), items: [question("q"), question("q")] });
    expect(toDesignVersionMeta(saved).valid).toBe(false);
    expect(toDesignVersionMeta(saved).valid).toBe(false);
    expect(validations.count).toBe(2);
  });

  it("is found again for the same id and revision in an emptied database", () => {
    expect(toDesignVersionMeta(row({ id: 7002 })).valid).toBe(true);
    const other = row({ id: 7002, updated: new Date(5000), items: [question("q"), question("q")] });
    expect(toDesignVersionMeta(other).valid).toBe(false);
  });
});

describe("a URL parameter's pattern", () => {
  const rules = (pattern: string) => ({
    item: { type: "session" as const, urlParams: [{ name: "panel", pattern }] },
    coders: [],
  });

  it("is matched in full", () => {
    expect(sessionValues(rules("[0-9a-f]{4}"), {}, { panel: "12ab" }, null).session).toEqual({ panel: "12ab" });
    expect(() => sessionValues(rules("[0-9a-f]{4}"), {}, { panel: "12abc" }, null)).toThrow(/doesn't accept/);
  });

  it("can't stall the server: a pattern that backtracks is matched in linear time", () => {
    const start = Date.now();
    expect(() => sessionValues(rules("a*a*a*a*a*a*b"), {}, { panel: "a".repeat(256) }, null)).toThrow(/doesn't accept/);
    expect(Date.now() - start).toBeLessThan(200);
  });
});
