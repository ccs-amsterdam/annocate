import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { changedKeys, emptyHistory, recordChange, redo, revertItem, undo, STEP_GROUP_MS, HISTORY_LIMIT } from "./editHistory";
import { findItem } from "./tree";

describe("edit history", () => {
  it("groups changes close in time into one step, and undoes and redoes them", () => {
    let h = emptyHistory<string>();
    h = recordChange(h, "a", 0); // a -> b
    h = recordChange(h, "b", 200); // b -> c: same step
    h = recordChange(h, "c", 200 + STEP_GROUP_MS + 1); // c -> d: new step
    expect(h.past).toEqual(["a", "c"]);
    const u1 = undo(h, "d")!;
    expect(u1.value).toBe("c");
    const u2 = undo(u1.history, "c")!;
    expect(u2.value).toBe("a");
    expect(undo(u2.history, "a")).toBeNull();
    const r = redo(u2.history, "a")!;
    expect(r.value).toBe("c");
    // A new change drops what could be redone
    expect(recordChange(r.history, "c", 10_000).future).toEqual([]);
  });

  it("keeps the last steps only", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = recordChange(h, i, i * 10_000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(10);
  });
});

describe("changes since the last save", () => {
  const saved = [
    { _key: "a", type: "question", name: "q1", variable: { type: "nominal", question: "?", options: [{ value: "x" }], layout: "row" } },
    { _key: "c", type: "condition", condition: { script: "true" }, children: [{ _key: "b", type: "question", name: "q2", variable: { type: "confirm", question: "?" } }] },
  ] as unknown as TopLevelItem[];

  it("marks new and changed items, not their parents", () => {
    const items = [
      { ...saved[0], variable: { type: "ordinal", question: "?", options: [{ value: 1 }] } },
      { ...saved[1], children: [{ _key: "b", type: "question", name: "q2b", variable: { type: "confirm", question: "?" } }, { _key: "n", type: "end", name: "stop", outcome: "screenout" }] },
    ] as unknown as TopLevelItem[];
    expect([...changedKeys(items, saved)].sort()).toEqual(["a", "b", "n"]);
    expect(changedKeys(saved, saved).size).toBe(0);
  });

  it("reverts one item, dropping fields it didn't have, and removes a new one", () => {
    const items = [
      { ...saved[0], variable: { type: "ordinal", question: "?", options: [{ value: 1 }] }, extra: 1 },
      { ...saved[1], children: [...(saved[1] as { children: unknown[] }).children, { _key: "n", type: "end", name: "stop", outcome: "screenout" }] },
    ] as unknown as TopLevelItem[];
    const reverted = revertItem(items, saved, "a");
    expect(JSON.parse(JSON.stringify(findItem(reverted, "a")))).toEqual(saved[0]);
    expect(findItem(revertItem(items, saved, "n"), "n")).toBeNull();
  });
});
