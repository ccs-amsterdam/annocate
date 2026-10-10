import { describe, expect, it } from "vitest";
import { DistributionRuleSchema, type DistributionRule } from "@annotinder/contracts";
import { UnitsetQueue } from "../distribution.js";

const crowd = (rule: Partial<Extract<DistributionRule, { mode: "crowd" }>>) =>
  DistributionRuleSchema.parse({ mode: "crowd", ...rule });

function queue(rule: DistributionRule, unitIds = [1, 2, 3], randomize = false) {
  return new UnitsetQueue("main", unitIds, rule, { randomize, seed: 0 });
}

/** Simulates a coder fetching and finishing their next unit. */
function codeNext(q: UnitsetQueue, coderId: number, key: string | null = null, now = 0): number | null {
  const next = q.next(coderId, now);
  if (next) q.recordCoding(coderId, next.unitId, key);
  return next?.unitId ?? null;
}

describe("per_coder distribution", () => {
  it("gives every coder every unit in order", () => {
    const q = queue({ mode: "per_coder" });
    expect([codeNext(q, 1), codeNext(q, 1), codeNext(q, 1), codeNext(q, 1)]).toEqual([1, 2, 3, null]);
    expect(codeNext(q, 2)).toBe(1);
  });

  it("repeats an unfinished unit until it is done", () => {
    const q = queue({ mode: "per_coder" });
    expect(q.next(1, 0)).toEqual({ unitId: 1 });
    expect(q.next(1, 0)).toEqual({ unitId: 1 });
  });

  it("caps units per coder", () => {
    const q = queue({ mode: "per_coder", maxUnitsPerCoder: 2 });
    expect([codeNext(q, 1), codeNext(q, 1), codeNext(q, 1)]).toEqual([1, 2, null]);
  });

  it("shuffles deterministically per coder when randomized", () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const a = queue({ mode: "per_coder" }, ids, true);
    const b = queue({ mode: "per_coder" }, ids, true);
    const orderA = Array.from({ length: 20 }, () => codeNext(a, 1));
    const orderB = Array.from({ length: 20 }, () => codeNext(b, 1));
    expect(orderA).toEqual(orderB);
    expect(orderA).not.toEqual(ids);
    expect([...orderA].sort((x, y) => x! - y!)).toEqual(ids);
  });
});

describe("crowd distribution", () => {
  it("stops handing out a unit once codersPerUnit coders finished it", () => {
    const q = queue(crowd({ codersPerUnit: 2 }), [1, 2]);
    expect(codeNext(q, 1)).toBe(1);
    expect(codeNext(q, 2)).toBe(1);
    expect(q.isComplete(1)).toBe(true);
    expect(codeNext(q, 3)).toBe(2);
  });

  it("counts active leases against open slots, and frees them on expiry", () => {
    const q = queue(crowd({ codersPerUnit: 1, leaseSeconds: 10 }), [1, 2]);
    expect(q.next(1, 0)).toEqual({ unitId: 1 });
    expect(q.next(2, 0)).toEqual({ unitId: 2 });
    expect(q.next(3, 0)).toBeNull();
    // coder 1's lease expired; unit 1 goes to coder 3
    expect(q.next(3, 11_000)).toEqual({ unitId: 1 });
  });

  it("resumes a coder's own lease instead of assigning a new unit", () => {
    const q = queue(crowd({ codersPerUnit: 1 }), [1, 2]);
    expect(q.next(1, 0)).toEqual({ unitId: 1 });
    expect(q.next(1, 0)).toEqual({ unitId: 1 });
    expect(q.canSubmit(1, 1)).toBe(true);
    expect(q.canSubmit(1, 2)).toBe(false);
  });

  it("keeps coding a unit until enough coders agree, up to maxCoders", () => {
    const q = queue(crowd({ agreement: { variable: "v", minAgree: 2, maxCoders: 3 } }), [1, 2]);
    expect(codeNext(q, 1, "yes")).toBe(1);
    expect(codeNext(q, 2, "no")).toBe(1);
    expect(q.isComplete(1)).toBe(false);
    expect(codeNext(q, 3, "yes")).toBe(1);
    expect(q.isComplete(1)).toBe(true);

    const q2 = queue(crowd({ agreement: { variable: "v", minAgree: 3, maxCoders: 3 } }), [1]);
    codeNext(q2, 1, "a");
    codeNext(q2, 2, "b");
    codeNext(q2, 3, "c");
    expect(q2.isComplete(1)).toBe(true); // gave up at maxCoders
    expect(codeNext(q2, 4)).toBeNull();
  });

  it("fill prefers units closest to completion, spread prefers the least coded", () => {
    const fill = queue(crowd({ codersPerUnit: 3 }), [1, 2]);
    codeNext(fill, 1); // unit 1
    fill.recordCoding(2, 2, null); // coder 2 did unit 2 directly
    fill.recordCoding(3, 2, null); // unit 2 now has 2 codings
    expect(fill.next(4, 0)).toEqual({ unitId: 2 });

    const spread = queue(crowd({ codersPerUnit: 3, strategy: "spread" }), [1, 2]);
    spread.recordCoding(1, 1, null);
    expect(spread.next(2, 0)).toEqual({ unitId: 2 });
  });

  it("caps units per coder", () => {
    const q = queue(crowd({ codersPerUnit: 1, maxUnitsPerCoder: 1 }), [1, 2]);
    expect(codeNext(q, 1)).toBe(1);
    expect(codeNext(q, 1)).toBeNull();
  });

  it("reports status", () => {
    const q = queue(crowd({ codersPerUnit: 1 }), [1, 2, 3]);
    codeNext(q, 1);
    q.next(2, 0);
    expect(q.status(0)).toMatchObject({ totalUnits: 3, completeUnits: 1, startedUnits: 1, leasedUnits: 1, codings: 1 });
  });
});
