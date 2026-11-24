import type { VariableValue } from "@annotinder/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { UnitDraftStore } from "./unitDraft";

const storage = new Map<string, string>();
/** Whether the browser's storage works (private mode, full: it throws). */
let working = true;
const stored = <T>(run: () => T): T => {
  if (!working) throw new Error("storage is not available");
  return run();
};
globalThis.localStorage = {
  getItem: (k: string) => stored(() => storage.get(k) ?? null),
  setItem: (k: string, v: string) => stored(() => void storage.set(k, v)),
  removeItem: (k: string) => stored(() => void storage.delete(k)),
} as Storage;

const answer = (value: string) => ({ done: true, values: [{ value }] }) as unknown as VariableValue;

function store(sessionId: number | null = 1): UnitDraftStore {
  const drafts = new UnitDraftStore();
  drafts.sessionId = sessionId;
  return drafts;
}

beforeEach(() => {
  storage.clear();
  working = true;
});

describe("drafts of unfinished units (UnitDraftStore)", () => {
  it("keeps a draft per unit: writing one leaves the others", () => {
    const drafts = store();
    drafts.write({ loop: "1", unitId: 1, answers: { q1: answer("A") } });
    drafts.write({ loop: "1", unitId: 2, answers: { q1: answer("B") } });
    drafts.write({ loop: "2", unitId: 1, answers: { q1: answer("C") } });
    expect(drafts.read("1", 1)).toEqual({ q1: answer("A") });
    expect(drafts.read("1", 2)).toEqual({ q1: answer("B") });
    expect(drafts.read("2", 1)).toEqual({ q1: answer("C") });
    expect(drafts.read("1", 3)).toBeNull();
  });

  it("a unit's draft is replaced when written again, and found back by another store (a reload)", () => {
    store().write({ loop: "1", unitId: 1, answers: { q1: answer("A") } });
    store().write({ loop: "1", unitId: 1, answers: { q1: answer("A"), q2: answer("B") } });
    expect(store().read("1", 1)).toEqual({ q1: answer("A"), q2: answer("B") });
  });

  it("clearing a unit's draft leaves the others; clearing all leaves nothing in the browser", () => {
    const drafts = store();
    drafts.write({ loop: "1", unitId: 1, answers: { q1: answer("A") } });
    drafts.write({ loop: "1", unitId: 2, answers: { q1: answer("B") } });
    drafts.clear("1", 1);
    expect(drafts.read("1", 1)).toBeNull();
    expect(drafts.read("1", 2)).toEqual({ q1: answer("B") });
    drafts.clearAll();
    expect(drafts.read("1", 2)).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("belongs to one coder session: another session doesn't see it, and none keeps nothing", () => {
    store(1).write({ loop: "1", unitId: 1, answers: { q1: answer("A") } });
    expect(store(2).read("1", 1)).toBeNull();
    store(null).write({ loop: "1", unitId: 1, answers: { q1: answer("B") } });
    expect(store(null).read("1", 1)).toBeNull();
    expect(store(1).read("1", 1)).toEqual({ q1: answer("A") });
  });

  it("stays small: the oldest drafts go once there are more than twenty", () => {
    const drafts = store();
    for (let unitId = 1; unitId <= 25; unitId++) drafts.write({ loop: "1", unitId, answers: { q1: answer("A") } });
    // Written again: unit 6 is the newest now
    drafts.write({ loop: "1", unitId: 6, answers: { q1: answer("B") } });
    drafts.write({ loop: "1", unitId: 26, answers: { q1: answer("A") } });
    expect(drafts.read("1", 5)).toBeNull();
    expect(drafts.read("1", 7)).toBeNull();
    expect(drafts.read("1", 6)).toEqual({ q1: answer("B") });
    expect(drafts.read("1", 8)).not.toBeNull();
    expect(drafts.read("1", 26)).not.toBeNull();
  });

  it("storage that fails, or holds something else, keeps no drafts and doesn't throw", () => {
    const drafts = store();
    storage.set("annotinder:unit-drafts:1", "not json");
    expect(drafts.read("1", 1)).toBeNull();
    working = false;
    drafts.write({ loop: "1", unitId: 1, answers: { q1: answer("A") } });
    drafts.clear("1", 1);
    drafts.clearAll();
    expect(drafts.read("1", 1)).toBeNull();
  });
});
