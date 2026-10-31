import { seededShuffle, sharedDefaults } from "@annotinder/contracts";

// Unit distribution: the rules, pure. The runtime loads the state they work
// on from the store for each decision (finished codings, `unit_codings`, and
// the leases of shared queues, `unit_leases`), and stores the leases it hands
// out (docs/architecture.md §3).

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
    if (!unit.has(coderId)) {
      const done = this.byCoder.get(coderId);
      if (done) done.push(unitId);
      else this.byCoder.set(coderId, [unitId]);
    }
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
   * The unit this coder should get next, if any. `order` is this coder's
   * view of the unitset order (shuffled for random loops); among equally
   * good units the first in that order wins. Has no side effects; call
   * `take` for the unit actually handed out.
   */
  best(coderId: number, now: number, shuffleSeed: number | null, { reach = "slots" }: { reach?: Reach } = {}): number | undefined {
    const order = shuffleSeed === null ? this.units : seededShuffle(this.units, shuffleSeed);
    const rule = this.rule;
    if (!rule) return order.find((id) => !this.codings.has(coderId, id));

    // Within the open slots: least coded first (`cover`), or most coded
    // (`saturate`). Past them (`Reach`): least coded first, counting
    // leases, so coders spread over the units.
    const sign = reach === "slots" && rule.priority === "saturate" ? -1 : 1;
    const agreement = rule.agreement;
    let found: number | undefined;
    let lowest = Infinity;
    for (const id of order) {
      if (this.codings.has(coderId, id)) continue;
      let score: number;
      if (reach === "slots") {
        if (this.openSlots(id, now) <= 0) continue;
        score = sign * this.codings.forUnit(id).size;
      } else {
        if (reach === "full" ? this.isFull(id) : agreement && this.topAgreement(id) >= agreement.minAgree) continue;
        score = this.codings.forUnit(id).size + this.activeLeases(id, now);
      }
      if (score < lowest) {
        found = id;
        lowest = score;
        // Nothing beats a unit nobody has yet (least coded first).
        if (score === 0 && sign === 1) break;
      }
    }
    return found;
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
 * (`main`) and the special units mixed in (`extras`: practice, overlap,
 * gold, in that order of precedence). Returns null when the coder is done
 * with the loop. `maxUnits` caps the coder's own units (shared queues), not
 * the special ones. Without open slots, a coder gets any unit that isn't
 * full; below `minUnits`, also units past `maxCoders` (`Reach`).
 *
 * `before` extras come first; `after` ones once the own units are done;
 * `spread` ones evenly among the units the coder is expected to get
 * (`maxUnits`, else the size of their set). Special units left when the
 * own units run out come at the end.
 */
export function pickNext(
  main: UnitPool,
  extras: OverlapPlacement[],
  coderId: number,
  codings: Codings,
  options: { order: "sequential" | "random"; maxUnits?: number; minUnits?: number; seed: number; now: number },
): { pool: UnitPool; unitId: number } | null {
  // Resume a unit leased to this coder (they reloaded, or went back and forth).
  const held = main.heldLease(coderId);
  if (held !== undefined) return { pool: main, unitId: held };

  const done = codings.doneBy(coderId);
  const doneOwn = done.filter((id) => main.has(id) && !extras.some((e) => e.pool.has(id))).length;
  const shuffleSeed = options.order === "random" ? options.seed + coderId : null;
  let own: number | undefined;
  if (options.maxUnits === undefined || doneOwn < options.maxUnits) {
    own = main.best(coderId, options.now, shuffleSeed);
    own ??= main.best(coderId, options.now, shuffleSeed, { reach: "full" });
    if (own === undefined && options.minUnits !== undefined && doneOwn < options.minUnits) {
      own = main.best(coderId, options.now, shuffleSeed, { reach: "pastMax" });
    }
  }
  const expected = options.maxUnits ?? main.size;
  let fallback: { pool: UnitPool; unitId: number } | null = null;
  for (const extra of extras) {
    const unitId = extra.pool.best(coderId, options.now, shuffleSeed);
    if (unitId === undefined) continue;
    fallback ??= { pool: extra.pool, unitId };
    if (own === undefined || extra.placement === "before") return { pool: extra.pool, unitId };
    if (extra.placement === "spread") {
      // The N own units are cut into M + 1 equal parts, and special unit j
      // (0-based) follows part j, i.e. comes after round((j + 1) * N / (M + 1)) own units.
      const doneExtra = done.filter((id) => extra.pool.has(id)).length;
      const due = Math.round(((doneExtra + 1) * expected) / (extra.pool.size + 1));
      if (doneOwn >= due) return { pool: extra.pool, unitId };
    }
  }
  return own !== undefined ? { pool: main, unitId: own } : fallback;
}
