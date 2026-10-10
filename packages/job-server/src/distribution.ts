import type { DistributionRule } from "@annotinder/contracts";

// Pure, in-memory unit distribution for one unitset of one deployment. All
// state here is derived from the db server's annotations (via
// `recordCoding`) except leases, which are deliberately ephemeral: losing
// them on a restart only means an abandoned unit returns to the queue early.

interface UnitState {
  /** coderId -> agreement key of that coder's answer (null if not comparable / no agreement rule). */
  codings: Map<number, string | null>;
  /** coderId -> lease expiry (ms epoch). Crowd mode only. */
  leases: Map<number, number>;
}

export type NextResult = { unitId: number } | null;

export class UnitsetQueue {
  private units = new Map<number, UnitState>();
  /** coderId -> unit ids in the order this coder finished them. */
  private coderDone = new Map<number, number[]>();
  /** coderId -> unit currently leased to that coder (crowd mode). */
  private coderLease = new Map<number, number>();

  constructor(
    readonly name: string,
    private unitIds: number[],
    readonly rule: DistributionRule,
    private options: { randomize: boolean; seed: number },
  ) {
    for (const id of unitIds) this.units.set(id, { codings: new Map(), leases: new Map() });
  }

  has(unitId: number): boolean {
    return this.units.has(unitId);
  }

  doneBy(coderId: number): number[] {
    return this.coderDone.get(coderId) ?? [];
  }

  /** Records that a coder finished a unit (idempotent; a re-submit updates the agreement key). */
  recordCoding(coderId: number, unitId: number, agreementKey: string | null): void {
    const unit = this.units.get(unitId);
    if (!unit) return;
    if (!unit.codings.has(coderId)) {
      this.coderDone.set(coderId, [...this.doneBy(coderId), unitId]);
    }
    unit.codings.set(coderId, agreementKey);
    unit.leases.delete(coderId);
    if (this.coderLease.get(coderId) === unitId) this.coderLease.delete(coderId);
  }

  /** Drops a unit, e.g. because the db server no longer has it. */
  removeUnit(unitId: number): void {
    const unit = this.units.get(unitId);
    if (!unit) return;
    for (const coderId of unit.leases.keys()) this.coderLease.delete(coderId);
    this.units.delete(unitId);
    this.unitIds = this.unitIds.filter((id) => id !== unitId);
  }

  /** Whether the coder may submit an annotation for this unit. */
  canSubmit(coderId: number, unitId: number): boolean {
    const unit = this.units.get(unitId);
    if (!unit) return false;
    if (this.rule.mode === "per_coder") return true;
    // Crowd: own earlier coding (editing after going back), or the unit is
    // leased to this coder. An expired lease is still honoured -- worst case
    // the unit gets one coding more than needed.
    return unit.codings.has(coderId) || this.coderLease.get(coderId) === unitId;
  }

  /** Picks (and, in crowd mode, leases) the next unit for a coder. Returns null when the coder is done. */
  next(coderId: number, now: number, skip: Set<number> = new Set()): NextResult {
    const rule = this.rule;
    const done = this.doneBy(coderId);

    if (rule.mode === "per_coder") {
      if (rule.maxUnitsPerCoder !== undefined && done.length >= rule.maxUnitsPerCoder) return null;
      const doneSet = new Set(done);
      const unitId = this.orderFor(coderId).find((id) => !doneSet.has(id) && !skip.has(id));
      return unitId === undefined ? null : { unitId };
    }

    // Resume an existing lease (the client re-requests "next" after a reload).
    const leased = this.coderLease.get(coderId);
    const leasedUnit = leased === undefined ? undefined : this.units.get(leased);
    if (leasedUnit && !skip.has(leased!) && !leasedUnit.codings.has(coderId) && !this.complete(leasedUnit)) {
      leasedUnit.leases.set(coderId, now + rule.leaseSeconds * 1000);
      return { unitId: leased! };
    }

    if (rule.maxUnitsPerCoder !== undefined && done.length >= rule.maxUnitsPerCoder) return null;

    let best: number | undefined;
    let bestScore = -Infinity;
    for (const unitId of this.orderFor(coderId)) {
      if (skip.has(unitId)) continue;
      const unit = this.units.get(unitId)!;
      if (unit.codings.has(coderId)) continue;
      if (this.openSlots(unit, now) <= 0) continue;
      const score = rule.strategy === "fill" ? unit.codings.size : -unit.codings.size;
      if (score > bestScore) {
        best = unitId;
        bestScore = score;
      }
    }
    if (best === undefined) return null;

    if (leased !== undefined) this.units.get(leased)?.leases.delete(coderId);
    this.units.get(best)!.leases.set(coderId, now + rule.leaseSeconds * 1000);
    this.coderLease.set(coderId, best);
    return { unitId: best };
  }

  /** The next few unit ids this coder would likely get, for prefetching unit content. */
  upcoming(coderId: number, after: number, n: number): number[] {
    if (this.rule.mode !== "per_coder") return [];
    const doneSet = new Set(this.doneBy(coderId));
    return this.orderFor(coderId)
      .filter((id) => !doneSet.has(id) && id !== after)
      .slice(0, n);
  }

  isComplete(unitId: number): boolean {
    const unit = this.units.get(unitId);
    return unit ? this.complete(unit) : false;
  }

  status(now: number) {
    let completeUnits = 0;
    let startedUnits = 0;
    let leasedUnits = 0;
    let codings = 0;
    const coders = this.coderDone.size;
    for (const unit of this.units.values()) {
      codings += unit.codings.size;
      if (unit.codings.size > 0) startedUnits++;
      if (this.activeLeases(unit, now) > 0) leasedUnits++;
      if (this.rule.mode === "crowd" ? this.complete(unit) : coders > 0 && unit.codings.size >= coders) {
        completeUnits++;
      }
    }
    return {
      unitset: this.name,
      mode: this.rule.mode,
      totalUnits: this.units.size,
      completeUnits,
      startedUnits,
      leasedUnits,
      codings,
    };
  }

  private orderFor(coderId: number): number[] {
    return this.options.randomize ? shuffleWithSeed(this.unitIds, coderId + this.options.seed) : this.unitIds;
  }

  private activeLeases(unit: UnitState, now: number): number {
    let n = 0;
    for (const [coderId, expires] of unit.leases) {
      if (expires > now) n++;
      else unit.leases.delete(coderId);
    }
    return n;
  }

  private topAgreement(unit: UnitState): number {
    const counts = new Map<string, number>();
    let top = 0;
    for (const key of unit.codings.values()) {
      if (key === null) continue;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      top = Math.max(top, n);
    }
    return top;
  }

  private complete(unit: UnitState): boolean {
    if (this.rule.mode !== "crowd") return false;
    const { codersPerUnit, agreement } = this.rule;
    const done = unit.codings.size;
    if (agreement && done >= agreement.maxCoders) return true;
    if (done < codersPerUnit) return false;
    return !agreement || this.topAgreement(unit) >= agreement.minAgree;
  }

  /** How many more coders may start this unit right now. */
  private openSlots(unit: UnitState, now: number): number {
    if (this.rule.mode !== "crowd" || this.complete(unit)) return 0;
    const { codersPerUnit, agreement } = this.rule;
    const done = unit.codings.size;
    const needed = Math.max(codersPerUnit - done, agreement ? agreement.minAgree - this.topAgreement(unit) : 0);
    const cap = agreement ? agreement.maxCoders - done : Infinity;
    return Math.min(needed, cap) - this.activeLeases(unit, now);
  }
}

/** Deterministic per-coder shuffle (Mulberry32), same as the mock server's legacy routes. */
export function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  const random = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
