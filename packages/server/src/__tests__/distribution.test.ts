import { describe, expect, it } from "vitest";
import { Codings, UnitPool, pickNext, type OverlapPlacement, type SharedRule } from "../runtime/distribution.js";

const answer = (code: string) => ({ v: code });
/** A shared queue's rule, with the defaults of contracts `sharedDefaults`. */
const shared = (rule: Partial<SharedRule> = {}): SharedRule => ({
  minCoders: 1,
  agreement: undefined,
  maxCoders: undefined,
  priority: "cover",
  leaseSeconds: 900,
  ...rule,
});

function setup() {
  const codings = new Codings();
  const pool = (unitIds: number[], rule: SharedRule | null = null, name = "set") => new UnitPool(name, unitIds, rule, codings);
  /** Simulates a coder getting and finishing their next unit. */
  const codeNext = (
    main: UnitPool,
    coderId: number,
    opts: { overlap?: OverlapPlacement; order?: "sequential" | "random"; maxUnits?: number; minUnits?: number; code?: string; now?: number } = {},
  ) => {
    const now = opts.now ?? 0;
    const next = pickNext(main, opts.overlap ?? null, coderId, codings, {
      order: opts.order ?? "sequential",
      maxUnits: opts.maxUnits,
      minUnits: opts.minUnits,
      seed: 0,
      now,
    });
    if (!next) return null;
    next.pool.take(coderId, next.unitId, now);
    codings.record(coderId, next.unitId, answer(opts.code ?? "x"));
    return next.unitId;
  };
  /** Every unit a coder gets, in order. */
  const codeAll = (main: UnitPool, coderId: number, opts: Parameters<typeof codeNext>[2] = {}) => {
    const ids: number[] = [];
    for (let id = codeNext(main, coderId, opts); id !== null; id = codeNext(main, coderId, opts)) ids.push(id);
    return ids;
  };
  return { codings, pool, codeNext, codeAll };
}

describe("fixed pools", () => {
  it("give every coder every unit, in order", () => {
    const { pool, codeAll } = setup();
    const main = pool([1, 2, 3]);
    expect(codeAll(main, 1)).toEqual([1, 2, 3]);
    expect(codeAll(main, 2)).toEqual([1, 2, 3]);
  });

  it("shuffle per coder in random order, deterministically", () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const run = (coderId: number) => {
      const { pool, codeAll } = setup();
      return codeAll(pool(ids), coderId, { order: "random" });
    };
    const order = run(1);
    expect(run(1)).toEqual(order);
    expect([...order].sort((x, y) => x - y)).toEqual(ids);
    expect(order).not.toEqual(ids);
  });
});

describe("overlap", () => {
  it("comes before or after the coder's own units", () => {
    const { pool, codeAll } = setup();
    const main = pool([1, 2, 3]);
    const overlap = pool([10, 11], null, "overlap");
    expect(codeAll(main, 1, { overlap: { pool: overlap, placement: "before" } })).toEqual([10, 11, 1, 2, 3]);
    expect(codeAll(main, 2, { overlap: { pool: overlap, placement: "after" } })).toEqual([1, 2, 3, 10, 11]);
  });

  it("is spread evenly through the coder's own units", () => {
    const { pool, codeAll } = setup();
    const overlap = pool([10, 11], null, "overlap");
    expect(codeAll(pool([1, 2, 3, 4, 5, 6, 7]), 1, { overlap: { pool: overlap, placement: "spread" } })).toEqual([
      1, 2, 10, 3, 4, 5, 11, 6, 7,
    ]);
  });

  it("spreads over maxUnits in a shared queue, and comes at the end if the coder gets fewer units", () => {
    const { pool, codeAll } = setup();
    const overlap = { pool: pool([10], null, "overlap"), placement: "spread" as const };
    // maxUnits 4: the overlap unit goes in the middle; maxUnits caps only the coder's own units.
    expect(codeAll(pool([1, 2, 3, 4, 5, 6], shared({ maxCoders: 1 })), 1, { overlap, maxUnits: 4 })).toEqual([1, 2, 10, 3, 4]);
    // Only one unit left in the queue: the overlap unit comes after it.
    const { pool: pool2, codeAll: codeAll2 } = setup();
    const overlap2 = { pool: pool2([10], null, "overlap"), placement: "spread" as const };
    expect(codeAll2(pool2([1], shared({ maxCoders: 1 })), 1, { overlap: overlap2, maxUnits: 4 })).toEqual([1, 10]);
  });

  it("skips units the coder already did in their own set", () => {
    const { pool, codeAll } = setup();
    expect(codeAll(pool([1, 2]), 1, { overlap: { pool: pool([2, 3], null, "overlap"), placement: "after" } })).toEqual([1, 2, 3]);
  });
});

describe("shared queues", () => {
  it("stop handing out a unit once minCoders finished it", () => {
    const { pool, codeNext } = setup();
    const main = pool([1, 2], shared({ minCoders: 2 }));
    expect(codeNext(main, 1)).toBe(1);
    expect(codeNext(main, 2)).toBe(2); // cover: least-coded first
    expect(codeNext(main, 3)).toBe(1);
    expect(main.isComplete(1)).toBe(true);
  });

  it("respect maxUnits per coder", () => {
    const { pool, codeAll } = setup();
    expect(codeAll(pool([1, 2, 3, 4], shared({ minCoders: 2 })), 1, { maxUnits: 3 })).toEqual([1, 2, 3]);
  });

  it("count leases against open slots, and free them on expiry", () => {
    const { codings, pool } = setup();
    const p = pool([1, 2], shared({ leaseSeconds: 10 }));
    const next = (coder: number, now: number) => {
      const n = pickNext(p, null, coder, codings, { order: "sequential", seed: 0, now });
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
    const p = pool([1, 2], shared());
    const first = pickNext(p, null, 1, codings, { order: "sequential", seed: 0, now: 0 })!;
    p.take(1, first.unitId, 0);
    expect(pickNext(p, null, 1, codings, { order: "sequential", seed: 0, now: 0 })?.unitId).toBe(first.unitId);
    expect(p.canSubmit(1, first.unitId)).toBe(true);
    expect(p.canSubmit(1, 2)).toBe(false);
  });

  it("keep coding until enough coders agree, up to maxCoders", () => {
    const { pool, codeNext } = setup();
    const main = pool([1, 2], shared({ minCoders: 2, maxCoders: 3, agreement: { variable: "v", minAgree: 2 }, priority: "saturate" }));
    expect(codeNext(main, 1, { code: "yes" })).toBe(1);
    expect(codeNext(main, 2, { code: "no" })).toBe(1);
    expect(main.isComplete(1)).toBe(false);
    expect(codeNext(main, 3, { code: "yes" })).toBe(1);
    expect(main.isComplete(1)).toBe(true);
    expect(codeNext(main, 4)).toBe(2);

    const { pool: pool2, codeNext: codeNext2 } = setup();
    const gaveUp = pool2([1], shared({ minCoders: 2, maxCoders: 2, agreement: { variable: "v", minAgree: 2 } }));
    codeNext2(gaveUp, 1, { code: "a" });
    codeNext2(gaveUp, 2, { code: "b" });
    expect(gaveUp.isComplete(1)).toBe(true);
  });

  it("cover prefers the least-coded unit, saturate the most-coded", () => {
    const cover = setup();
    cover.codings.record(9, 1, answer("x"));
    expect(pickNext(cover.pool([1, 2], shared({ minCoders: 3 })), null, 1, cover.codings, { order: "sequential", seed: 0, now: 0 })?.unitId).toBe(2);

    const saturate = setup();
    saturate.codings.record(9, 2, answer("x"));
    const p = saturate.pool([1, 2], shared({ minCoders: 3, priority: "saturate" }));
    expect(pickNext(p, null, 1, saturate.codings, { order: "sequential", seed: 0, now: 0 })?.unitId).toBe(2);
  });

  it("give a coder below minUnits units past maxCoders and others' leases, least coded first, until saturated", () => {
    const { codings, pool, codeAll } = setup();
    // One coder per unit is enough, at most 1: three coders want at least 2 units each from 3 units.
    const main = pool([1, 2, 3], shared({ maxCoders: 1 }));
    expect(codeAll(main, 1, { maxUnits: 2 })).toEqual([1, 2]);
    // Coder 2 gets the last free unit, then (min 2) a unit past maxCoders: one that isn't
    // saturated is no longer there (minCoders 1), so nothing more.
    expect(codeAll(main, 2, { minUnits: 2 })).toEqual([3]);

    // Saturation needs 2 coders: a coder owed units gets the least-coded ones past maxCoders 2.
    const two = pool([4, 5, 6], shared({ minCoders: 2, maxCoders: 2 }));
    codings.record(7, 4, answer("x"));
    codings.record(8, 4, answer("x")); // unit 4 saturated
    codings.record(7, 5, answer("x"));
    // All units with open slots leased to others: none free for coder 1 normally
    two.take(9, 5, 0);
    two.take(10, 6, 0);
    two.take(11, 6, 0);
    const next = (minUnits?: number) => pickNext(two, null, 1, codings, { order: "sequential", seed: 0, now: 0, minUnits })?.unitId ?? null;
    expect(next()).toBeNull();
    // With minUnits: unit 6 (no codings, 2 leases) vs 5 (1 coding, 1 lease): equal load, first in order
    expect(next(1)).toBe(5);
  });

  it("with an overlap: one coder per unit plus a shared reliability set", () => {
    const { pool, codeAll } = setup();
    const main = pool([1, 2, 3, 4], shared({ maxCoders: 1 }), "pool");
    const overlap = { pool: pool([10], null, "overlap"), placement: "after" as const };
    expect(codeAll(main, 1, { overlap, maxUnits: 3 })).toEqual([1, 2, 3, 10]);
    expect(codeAll(main, 2, { overlap })).toEqual([4, 10]);
  });
});

describe("codings", () => {
  it("remember when a coder last finished a unit", () => {
    const codings = new Codings();
    codings.record(1, 1, {}, 100);
    codings.record(1, 2, {}, 50);
    expect(codings.lastFinished(1)).toBe(100);
    expect(codings.lastFinished(2)).toBe(0);
  });
});
