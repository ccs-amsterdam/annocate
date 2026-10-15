import { dynamicSourceDefaults, seededShuffle, type DynamicSource } from "@annotinder/contracts";

// Pure, in-memory unit distribution. All state is derived from the db
// server's annotations (`Codings`) except dynamic-source leases, which are
// deliberately ephemeral: losing them on a restart only means an abandoned
// unit returns to the queue early.

/**
 * A finished coding as far as distribution cares: agreement variable ->
 * `agreementKey` of the coder's answer. Only the agreement variables of
 * dynamic sources are kept (often none), not the full answers.
 */
export type AgreementKeys = Record<string, string | null>;

/** Finished codings: unitId -> coderId -> agreement keys, plus each coder's finish order. Shared by all pools. */
export class Codings {
  private byUnit = new Map<number, Map<number, AgreementKeys>>();
  private byCoder = new Map<number, number[]>();

  record(coderId: number, unitId: number, keys: AgreementKeys): void {
    let unit = this.byUnit.get(unitId);
    if (!unit) this.byUnit.set(unitId, (unit = new Map()));
    if (!unit.has(coderId)) this.byCoder.set(coderId, [...this.doneBy(coderId), unitId]);
    unit.set(coderId, keys);
  }

  forUnit(unitId: number): Map<number, AgreementKeys> {
    return this.byUnit.get(unitId) ?? new Map();
  }

  has(coderId: number, unitId: number): boolean {
    return this.byUnit.get(unitId)?.has(coderId) ?? false;
  }

  /** Drops the coder's codings (rebuilt from their annotations when they return). */
  forget(coderId: number): void {
    for (const unitId of this.doneBy(coderId)) this.byUnit.get(unitId)?.delete(coderId);
    this.byCoder.delete(coderId);
  }

  /** Unit ids the coder finished, in the order they finished them. */
  doneBy(coderId: number): number[] {
    return this.byCoder.get(coderId) ?? [];
  }
}

/**
 * One source of one unit_loop: a unitset, handed out either `fixed` (every
 * routed coder gets every unit) or `dynamic` (a shared queue with
 * saturation rules, see contracts unitLoop.ts).
 */
export class UnitPool {
  private units: number[];
  private unitSet: Set<number>;
  private rule: ReturnType<typeof dynamicSourceDefaults> | null;
  /** unitId -> coderId -> lease expiry (ms). Dynamic only. */
  private leases = new Map<number, Map<number, number>>();
  /** coderId -> leased unitId. Dynamic only; at most one per coder per pool. */
  private coderLease = new Map<number, number>();

  constructor(
    readonly unitset: string,
    unitIds: number[],
    readonly dynamic: DynamicSource | undefined,
    private codings: Codings,
  ) {
    this.units = unitIds;
    this.unitSet = new Set(unitIds);
    this.rule = dynamic ? dynamicSourceDefaults(dynamic) : null;
  }

  get mode(): "fixed" | "dynamic" {
    return this.rule ? "dynamic" : "fixed";
  }

  get size(): number {
    return this.units.length;
  }

  get unitIds(): readonly number[] {
    return this.units;
  }

  has(unitId: number): boolean {
    return this.unitSet.has(unitId);
  }

  removeUnit(unitId: number): void {
    if (!this.unitSet.delete(unitId)) return;
    this.units = this.units.filter((id) => id !== unitId);
    for (const coderId of this.leases.get(unitId)?.keys() ?? []) this.coderLease.delete(coderId);
    this.leases.delete(unitId);
  }

  /**
   * Units this coder could get next, best first. `order` is this coder's
   * view of the unitset order (shuffled for random loops). Has no side
   * effects; call `take` for the unit actually handed out.
   */
  candidates(coderId: number, now: number, shuffleSeed: number | null): number[] {
    const order = shuffleSeed === null ? this.units : seededShuffle(this.units, shuffleSeed);
    const open = order.filter((id) => !this.codings.has(coderId, id));
    if (!this.rule) return open;

    const withSlots = open.filter((id) => this.openSlots(id, now) > 0);
    // Stable sort keeps the coder's order among equally-coded units.
    const sign = this.rule.priority === "saturate" ? -1 : 1;
    return withSlots.sort((a, b) => sign * (this.codings.forUnit(a).size - this.codings.forUnit(b).size));
  }

  /** Marks a unit as handed out to this coder (leases it, for dynamic pools). */
  take(coderId: number, unitId: number, now: number): void {
    if (!this.rule) return;
    const previous = this.coderLease.get(coderId);
    if (previous !== undefined) this.leases.get(previous)?.delete(coderId);
    let unitLeases = this.leases.get(unitId);
    if (!unitLeases) this.leases.set(unitId, (unitLeases = new Map()));
    unitLeases.set(coderId, now + this.rule.leaseSeconds * 1000);
    this.coderLease.set(coderId, unitId);
  }

  /** A unit leased to this coder that they haven't finished (and that isn't complete), if any. */
  heldLease(coderId: number): number | undefined {
    const unitId = this.coderLease.get(coderId);
    if (unitId === undefined) return undefined;
    if (this.codings.has(coderId, unitId) || this.isComplete(unitId)) {
      this.coderLease.delete(coderId);
      this.leases.get(unitId)?.delete(coderId);
      return undefined;
    }
    return unitId;
  }

  /** Whether the coder may submit an annotation for this unit (as far as this pool is concerned). */
  canSubmit(coderId: number, unitId: number): boolean {
    if (!this.has(unitId)) return false;
    if (!this.rule) return true;
    // Own earlier coding (editing after going back), or leased to this coder.
    // An expired lease is still honoured: worst case one coding too many.
    return this.codings.has(coderId, unitId) || this.coderLease.get(coderId) === unitId;
  }

  isComplete(unitId: number): boolean {
    if (!this.rule) return false;
    const { minCoders, maxCoders, agreement } = this.rule;
    const done = this.codings.forUnit(unitId).size;
    if (maxCoders !== undefined && done >= maxCoders) return true;
    if (done < minCoders) return false;
    return !agreement || this.topAgreement(unitId) >= agreement.minAgree;
  }

  status(now: number, routedCoders: number[]) {
    let completeUnits = 0;
    let startedUnits = 0;
    let leasedUnits = 0;
    let codings = 0;
    for (const unitId of this.units) {
      const coded = this.codings.forUnit(unitId);
      codings += coded.size;
      if (coded.size > 0) startedUnits++;
      if (this.activeLeases(unitId, now) > 0) leasedUnits++;
      const complete = this.rule
        ? this.isComplete(unitId)
        : routedCoders.length > 0 && routedCoders.every((c) => coded.has(c));
      if (complete) completeUnits++;
    }
    return { mode: this.mode, totalUnits: this.units.length, completeUnits, startedUnits, leasedUnits, codings };
  }

  private activeLeases(unitId: number, now: number): number {
    const unitLeases = this.leases.get(unitId);
    if (!unitLeases) return 0;
    let n = 0;
    for (const [coderId, expires] of unitLeases) {
      // A lease ends when it expires or when its coder finished the unit.
      if (expires > now && !this.codings.has(coderId, unitId)) n++;
      else unitLeases.delete(coderId);
    }
    return n;
  }

  private topAgreement(unitId: number): number {
    const variable = this.rule?.agreement?.variable;
    if (!variable) return 0;
    const counts = new Map<string, number>();
    let top = 0;
    for (const keys of this.codings.forUnit(unitId).values()) {
      const key = keys[variable];
      if (key === null || key === undefined) continue;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      top = Math.max(top, n);
    }
    return top;
  }

  /** How many more coders may start this unit right now. */
  private openSlots(unitId: number, now: number): number {
    if (!this.rule || this.isComplete(unitId)) return 0;
    const { minCoders, maxCoders, agreement } = this.rule;
    const done = this.codings.forUnit(unitId).size;
    const needed = Math.max(minCoders - done, agreement ? agreement.minAgree - this.topAgreement(unitId) : 0);
    const cap = maxCoders === undefined ? Infinity : maxCoders - done;
    return Math.min(needed, cap) - this.activeLeases(unitId, now);
  }
}

/**
 * Picks the next unit for a coder in one unit_loop, given the pools their
 * branch routed them to. Returns null when the coder is done with the loop.
 */
export function pickNext(
  sources: UnitPool[],
  coderId: number,
  codings: Codings,
  options: { order: "sequential" | "random"; maxUnits?: number; seed: number; now: number },
): { pool: UnitPool; unitId: number } | null {
  // Resume a unit leased to this coder (they reloaded, or went back and forth).
  for (const pool of sources) {
    const held = pool.heldLease(coderId);
    if (held !== undefined) return { pool, unitId: held };
  }

  const done = codings.doneBy(coderId).filter((id) => sources.some((p) => p.has(id)));
  if (options.maxUnits !== undefined && done.length >= options.maxUnits) return null;

  const random = options.order === "random";
  const shuffleSeed = random ? options.seed + coderId : null;
  const perSource = sources
    .map((pool) => ({ pool, candidates: pool.candidates(coderId, options.now, shuffleSeed) }))
    .filter((s) => s.candidates.length > 0);
  if (perSource.length === 0) return null;

  let chosen = perSource[0];
  if (random && perSource.length > 1) {
    // Interleave sources in proportion to what's left in each, deterministic
    // per coder and step so a reload before submitting picks the same source.
    const total = perSource.reduce((n, s) => n + s.candidates.length, 0);
    let r = Math.floor(random01(options.seed + coderId * 7919 + done.length) * total);
    for (const s of perSource) {
      if (r < s.candidates.length) {
        chosen = s;
        break;
      }
      r -= s.candidates.length;
    }
  }
  return { pool: chosen.pool, unitId: chosen.candidates[0] };
}

/** One deterministic draw in [0, 1) for a seed (Mulberry32 step). */
function random01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
