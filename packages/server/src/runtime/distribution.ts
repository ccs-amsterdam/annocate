import { seededShuffle, sharedDefaults } from "@annotinder/contracts";

// Unit distribution: the rules, pure. The runtime loads the state they work
// on from the store for each decision (finished codings, `unit_codings`, and
// the leases of shared queues, `unit_leases`), and stores the leases it hands
// out (docs/plan-stateless-runtime.md §6).

/** A shared queue's rule (contracts `sharedDefaults`). */
export type SharedRule = ReturnType<typeof sharedDefaults>;

/**
 * A finished coding as far as distribution cares: agreement variable ->
 * `agreementKey` of the coder's answer. Only the agreement questions of
 * shared queues are kept (often none), not the full answers.
 */
export type AgreementKeys = Record<string, string | null>;

/** Finished codings: unitId -> coderId -> agreement keys, plus each coder's finish order. Shared by all pools. */
export class Codings {
  private byUnit = new Map<number, Map<number, AgreementKeys>>();
  private byCoder = new Map<number, number[]>();
  /** coderId -> when they last finished a unit (ms). */
  private lastAt = new Map<number, number>();

  /** `at`: when the coder finished it (ms). */
  record(coderId: number, unitId: number, keys: AgreementKeys, at = 0): void {
    let unit = this.byUnit.get(unitId);
    if (!unit) this.byUnit.set(unitId, (unit = new Map()));
    if (!unit.has(coderId)) this.byCoder.set(coderId, [...this.doneBy(coderId), unitId]);
    unit.set(coderId, keys);
    if (at > (this.lastAt.get(coderId) ?? 0)) this.lastAt.set(coderId, at);
  }

  /** When the coder last finished a unit here (ms), 0 if never. */
  lastFinished(coderId: number): number {
    return this.lastAt.get(coderId) ?? 0;
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
    this.lastAt.delete(coderId);
  }

  /** Unit ids the coder finished, in the order they finished them. */
  doneBy(coderId: number): number[] {
    return this.byCoder.get(coderId) ?? [];
  }
}

/**
 * One unitset of one unit_loop branch, handed out either `fixed` (every
 * routed coder gets every unit: `all`, `sets` and `invitation` mode, and
 * overlaps) or `dynamic` (a shared queue with saturation rules: `shared`
 * mode, see contracts unitLoop.ts).
 */
export class UnitPool {
  private units: number[];
  private unitSet: Set<number>;
  /** unitId -> coderId -> lease expiry (ms). Dynamic only. */
  private leases = new Map<number, Map<number, number>>();
  /** coderId -> the units leased to them, in the order handed out. Dynamic only; a coder holds up to a batch. */
  private coderLeases = new Map<number, number[]>();

  constructor(
    readonly unitset: string,
    unitIds: number[],
    /** The shared queue's rule; null: fixed. */
    readonly rule: SharedRule | null,
    private codings: Codings,
  ) {
    this.units = unitIds;
    this.unitSet = new Set(unitIds);
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
    for (const coderId of this.leases.get(unitId)?.keys() ?? []) this.dropLease(coderId, unitId);
    this.leases.delete(unitId);
  }

  /**
   * Units this coder could get next, best first. `order` is this coder's
   * view of the unitset order (shuffled for random loops). Has no side
   * effects; call `take` for the unit actually handed out.
   */
  candidates(coderId: number, now: number, shuffleSeed: number | null, { reach = "slots" }: { reach?: Reach } = {}): number[] {
    const order = shuffleSeed === null ? this.units : seededShuffle(this.units, shuffleSeed);
    const open = order.filter((id) => !this.codings.has(coderId, id));
    if (!this.rule) return open;

    // Past the open slots (`Reach`): least coded first (codings and leases),
    // so coders spread over the units.
    if (reach !== "slots") {
      const load = (id: number) => this.codings.forUnit(id).size + this.activeLeases(id, now);
      const agreement = this.rule.agreement;
      const left =
        reach === "full"
          ? (id: number) => !this.isFull(id)
          : (id: number) => !agreement || this.topAgreement(id) < agreement.minAgree;
      return open.filter(left).sort((a, b) => load(a) - load(b));
    }

    const withSlots = open.filter((id) => this.openSlots(id, now) > 0);
    // Stable sort keeps the coder's order among equally-coded units.
    const sign = this.rule.priority === "saturate" ? -1 : 1;
    return withSlots.sort((a, b) => sign * (this.codings.forUnit(a).size - this.codings.forUnit(b).size));
  }

  /** Leases as stored (also expired ones: an expired lease is still the coder's own unit, `heldLease`). */
  loadLeases(leases: { coderId: number; unitId: number; expires: number }[]): void {
    for (const { coderId, unitId, expires } of leases) {
      if (!this.unitSet.has(unitId)) continue;
      let unitLeases = this.leases.get(unitId);
      if (!unitLeases) this.leases.set(unitId, (unitLeases = new Map()));
      unitLeases.set(coderId, expires);
      this.addLease(coderId, unitId);
    }
  }

  /** Marks a unit as handed out to this coder (leases it, for dynamic pools; a lease held already is renewed). */
  take(coderId: number, unitId: number, now: number): void {
    if (!this.rule) return;
    let unitLeases = this.leases.get(unitId);
    if (!unitLeases) this.leases.set(unitId, (unitLeases = new Map()));
    unitLeases.set(coderId, now + this.rule.leaseSeconds * 1000);
    this.addLease(coderId, unitId);
  }

  /**
   * The first unit leased to this coder that they haven't finished (and that
   * the `until` rule doesn't consider done), if any. A unit others filled up
   * to `maxCoders` meanwhile stays theirs: at worst one coding too many (and
   * a coder may reach past `maxCoders` anyway, `Reach`). Leases of units
   * that are done are dropped on the way.
   */
  heldLease(coderId: number): number | undefined {
    for (const unitId of [...(this.coderLeases.get(coderId) ?? [])]) {
      if (!this.codings.has(coderId, unitId) && !this.isSaturated(unitId)) return unitId;
      this.dropLease(coderId, unitId);
      this.leases.get(unitId)?.delete(coderId);
    }
    return undefined;
  }

  private addLease(coderId: number, unitId: number): void {
    const held = this.coderLeases.get(coderId) ?? [];
    if (!held.includes(unitId)) this.coderLeases.set(coderId, [...held, unitId]);
  }

  private dropLease(coderId: number, unitId: number): void {
    const held = (this.coderLeases.get(coderId) ?? []).filter((id) => id !== unitId);
    if (held.length > 0) this.coderLeases.set(coderId, held);
    else this.coderLeases.delete(coderId);
  }

  /** Whether the coder may submit an annotation for this unit (as far as this pool is concerned). */
  canSubmit(coderId: number, unitId: number): boolean {
    if (!this.has(unitId)) return false;
    if (!this.rule) return true;
    // Own earlier coding (editing after going back), or leased to this coder.
    // An expired lease is still honoured: worst case one coding too many.
    return this.codings.has(coderId, unitId) || (this.coderLeases.get(coderId) ?? []).includes(unitId);
  }

  isComplete(unitId: number): boolean {
    if (!this.rule) return false;
    const { maxCoders } = this.rule;
    if (maxCoders !== undefined && this.codings.forUnit(unitId).size >= maxCoders) return true;
    return this.isSaturated(unitId);
  }

  /**
   * Whether no coder can get the unit any more, apart from a coder below
   * `minUnits` (`Reach`): finished codings reached `maxCoders`, coders agree (`agree`),
   * or, without `maxCoders`, enough coders coded it. Leases don't count.
   */
  isFull(unitId: number): boolean {
    if (!this.rule) return false;
    const { maxCoders, agreement } = this.rule;
    const done = this.codings.forUnit(unitId).size;
    if (maxCoders !== undefined && done >= maxCoders) return true;
    if (agreement) return this.topAgreement(unitId) >= agreement.minAgree;
    return maxCoders === undefined && this.isSaturated(unitId);
  }

  /** Whether the `until` rule considers the unit done: enough coders, or enough agreeing ones (`maxCoders` aside). */
  isSaturated(unitId: number): boolean {
    if (!this.rule) return false;
    const { minCoders, agreement } = this.rule;
    if (this.codings.forUnit(unitId).size < minCoders) return false;
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
 * How far a coder may reach in a shared queue. `slots`: units that need
 * more coders than they have or are reserved for (the normal case). `full`:
 * once there are none, any unit that isn't full (`isFull`), past other
 * coders' leases and up to `maxCoders`, so a coder only gets nothing when
 * every unit is full. `pastMax`: a coder below `minUnits` also goes past
 * `maxCoders`: any unit coders don't agree on yet (`agree`), or any unit
 * at all (`coders`).
 */
export type Reach = "slots" | "full" | "pastMax";

/** Where a branch's overlap units go among the coder's own units (contracts OverlapSchema). */
export interface OverlapPlacement {
  pool: UnitPool;
  placement: "before" | "after" | "spread";
}

/**
 * Picks the next unit for a coder in one unit_loop, from their own pool
 * (`main`) and the branch's overlap. Returns null when the coder is done
 * with the loop. `maxUnits` caps the coder's own units (shared queues), not
 * the overlap. Without open slots, a coder gets any unit that isn't full;
 * below `minUnits`, also units past `maxCoders` (`Reach`).
 *
 * Spread: the overlap units are placed evenly among the units the coder is
 * expected to get (`maxUnits`, else the size of their set). If they run out
 * of own units sooner, the overlap units left come at the end.
 */
export function pickNext(
  main: UnitPool,
  overlap: OverlapPlacement | null,
  coderId: number,
  codings: Codings,
  options: { order: "sequential" | "random"; maxUnits?: number; minUnits?: number; seed: number; now: number },
): { pool: UnitPool; unitId: number } | null {
  // Resume a unit leased to this coder (they reloaded, or went back and forth).
  const held = main.heldLease(coderId);
  if (held !== undefined) return { pool: main, unitId: held };

  const done = codings.doneBy(coderId);
  const doneOverlap = overlap ? done.filter((id) => overlap.pool.has(id)).length : 0;
  const doneOwn = done.filter((id) => main.has(id) && !overlap?.pool.has(id)).length;
  const shuffleSeed = options.order === "random" ? options.seed + coderId : null;
  let own: number[] = [];
  if (options.maxUnits === undefined || doneOwn < options.maxUnits) {
    own = main.candidates(coderId, options.now, shuffleSeed);
    if (own.length === 0) own = main.candidates(coderId, options.now, shuffleSeed, { reach: "full" });
    if (own.length === 0 && options.minUnits !== undefined && doneOwn < options.minUnits) {
      own = main.candidates(coderId, options.now, shuffleSeed, { reach: "pastMax" });
    }
  }
  const extra = overlap ? overlap.pool.candidates(coderId, options.now, shuffleSeed) : [];
  const pick = (pool: UnitPool, ids: number[]) => ({ pool, unitId: ids[0] });

  if (!overlap || extra.length === 0) return own.length > 0 ? pick(main, own) : null;
  if (own.length === 0) return pick(overlap.pool, extra);
  if (overlap.placement === "before") return pick(overlap.pool, extra);
  if (overlap.placement === "after") return pick(main, own);

  // Spread: the N own units are cut into M + 1 equal parts, and overlap unit
  // j (0-based) follows part j, i.e. comes after round((j + 1) * N / (M + 1)) own units.
  const expected = options.maxUnits ?? main.size;
  const due = Math.round(((doneOverlap + 1) * expected) / (overlap.pool.size + 1));
  return doneOwn >= due ? pick(overlap.pool, extra) : pick(main, own);
}
