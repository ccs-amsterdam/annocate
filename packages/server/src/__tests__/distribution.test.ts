import { describe, expect, it } from "vitest";
import type { DynamicSource } from "@annotinder/contracts";
import { Codings, UnitPool, pickNext } from "../runtime/distribution.js";

const answer = (code: string) => ({ v: code });

function setup() {
  const codings = new Codings();
  const pool = (unitIds: number[], dynamic?: DynamicSource, name = "set") => new UnitPool(name, unitIds, dynamic, codings);
  /** Simulates a coder getting and finishing their next unit. */
  const codeNext = (
    pools: UnitPool[],
    coderId: number,
    opts: { order?: "sequential" | "random"; maxUnits?: number; code?: string; now?: number } = {},
  ) => {
    const now = opts.now ?? 0;
    const next = pickNext(pools, coderId, codings, { order: opts.order ?? "sequential", maxUnits: opts.maxUnits, seed: 0, now });
    if (!next) return null;
    next.pool.take(coderId, next.unitId, now);
    codings.record(coderId, next.unitId, answer(opts.code ?? "x"));
    return next.unitId;
  };
  return { codings, pool, codeNext };
}

describe("fixed sources", () => {
  it("give every coder every unit, source by source", () => {
    const { pool, codeNext } = setup();
    const pools = [pool([1, 2]), pool([3])];
    expect([1, 2, 3, 4].map(() => codeNext(pools, 1))).toEqual([1, 2, 3, null]);
    expect(codeNext(pools, 2)).toBe(1);
  });

  it("skip units the coder already did in another source (overlap)", () => {
    const { pool, codeNext } = setup();
    const pools = [pool([1, 2]), pool([2, 3])];
    expect([1, 2, 3, 4].map(() => codeNext(pools, 1))).toEqual([1, 2, 3, null]);
  });

  it("respect maxUnits across sources", () => {
    const { pool, codeNext } = setup();
    const pools = [pool([1, 2]), pool([3, 4])];
    expect([1, 2, 3, 4].map(() => codeNext(pools, 1, { maxUnits: 3 }))).toEqual([1, 2, 3, null]);
  });

  it("interleave sources and shuffle per coder in random order, deterministically", () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const run = () => {
      const { pool, codeNext } = setup();
      const pools = [pool(ids.slice(0, 15)), pool(ids.slice(15))];
      return ids.map(() => codeNext(pools, 1, { order: "random" }));
    };
    const order = run();
    expect(run()).toEqual(order);
    expect([...order].sort((x, y) => x! - y!)).toEqual(ids);
    // the 5 units of the second source are mixed in, not all at the end
    expect(order.slice(0, 15).some((id) => id! > 15)).toBe(true);
  });
});

describe("dynamic sources", () => {
  it("stop handing out a unit once minCoders finished it", () => {
    const { pool, codeNext } = setup();
    const pools = [pool([1, 2], { minCoders: 2 })];
    expect(codeNext(pools, 1)).toBe(1);
    expect(codeNext(pools, 2)).toBe(2); // cover: least-coded first
    expect(codeNext(pools, 3)).toBe(1);
    expect(pools[0].isComplete(1)).toBe(true);
  });

  it("count leases against open slots, and free them on expiry", () => {
    const { codings, pool } = setup();
    const p = pool([1, 2], { minCoders: 1, leaseSeconds: 10 });
    const next = (coder: number, now: number) => {
      const n = pickNext([p], coder, codings, { order: "sequential", seed: 0, now });
      if (n) p.take(coder, n.unitId, now);
      return n?.unitId ?? null;
    };
    expect(next(1, 0)).toBe(1);
    expect(next(2, 0)).toBe(2);
    expect(next(3, 0)).toBeNull();
    expect(next(3, 11_000)).toBe(1); // coder 1's lease expired
  });

  it("resume a coder's own lease", () => {
    const { codings, pool } = setup();
    const p = pool([1, 2], { minCoders: 1 });
    const first = pickNext([p], 1, codings, { order: "sequential", seed: 0, now: 0 })!;
    p.take(1, first.unitId, 0);
    expect(pickNext([p], 1, codings, { order: "sequential", seed: 0, now: 0 })?.unitId).toBe(first.unitId);
    expect(p.canSubmit(1, first.unitId)).toBe(true);
    expect(p.canSubmit(1, 2)).toBe(false);
  });

  it("keep coding until enough coders agree, up to maxCoders", () => {
    const { pool, codeNext } = setup();
    const rule = { maxCoders: 3, agreement: { variable: "v", minAgree: 2 }, priority: "saturate" as const };
    const pools = [pool([1, 2], rule)];
    expect(codeNext(pools, 1, { code: "yes" })).toBe(1);
    expect(codeNext(pools, 2, { code: "no" })).toBe(1);
    expect(pools[0].isComplete(1)).toBe(false);
    expect(codeNext(pools, 3, { code: "yes" })).toBe(1);
    expect(pools[0].isComplete(1)).toBe(true);
    expect(codeNext(pools, 4)).toBe(2);

    const { pool: pool2, codeNext: codeNext2 } = setup();
    const gaveUp = [pool2([1], { maxCoders: 2, agreement: { variable: "v", minAgree: 2 } })];
    codeNext2(gaveUp, 1, { code: "a" });
    codeNext2(gaveUp, 2, { code: "b" });
    expect(gaveUp[0].isComplete(1)).toBe(true);
  });

  it("cover prefers the least-coded unit, saturate the most-coded", () => {
    const cover = setup();
    cover.codings.record(9, 1, answer("x"));
    expect(pickNext([cover.pool([1, 2], { minCoders: 3 })], 1, cover.codings, { order: "sequential", seed: 0, now: 0 })?.unitId).toBe(2);

    const saturate = setup();
    saturate.codings.record(9, 2, answer("x"));
    const p = saturate.pool([1, 2], { minCoders: 3, priority: "saturate" });
    expect(pickNext([p], 1, saturate.codings, { order: "sequential", seed: 0, now: 0 })?.unitId).toBe(2);
  });

  it("mix with fixed sources: one coder per unit plus a shared reliability set", () => {
    const { pool, codeNext } = setup();
    const pools = () => [pool([1, 2, 3, 4], { maxCoders: 1 }, "pool"), pool([10], undefined, "overlap")];
    const shared = pools();
    const coded1 = [1, 2, 3].map(() => codeNext(shared, 1, { maxUnits: 3 }));
    const coded2 = [1, 2, 3, 4].map(() => codeNext(shared, 2));
    expect(coded1).toEqual([1, 2, 3]);
    expect(coded2).toEqual([4, 10, null, null]);
  });
});
