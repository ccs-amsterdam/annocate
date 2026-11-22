// Agreement between coders (docs/plans/results-viewer.md): Krippendorff's
// alpha, percent agreement and Cohen's kappa, from codings: one value per
// unit and coder. Pure functions, used by the server's results.

/** One coder's value for one unit. */
export interface Coding {
  unit: string | number;
  coder: number;
  value: string | number;
}

/** How far apart two values are: categories (nominal), ordered values (ordinal) or numbers (interval). */
export type AlphaMetric = "nominal" | "ordinal" | "interval";

/** Units with at least two codings: only those say anything about agreement. */
function pairable(codings: readonly Coding[]): (string | number)[][] {
  const byUnit = new Map<string | number, (string | number)[]>();
  for (const { unit, value } of codings) {
    const values = byUnit.get(unit);
    if (values) values.push(value);
    else byUnit.set(unit, [value]);
  }
  return [...byUnit.values()].filter((values) => values.length >= 2);
}

/**
 * Krippendorff's alpha (Krippendorff 2011, "Computing Krippendorff's
 * Alpha-Reliability"): 1 is perfect agreement, 0 what chance gives. Any
 * number of coders per unit; units with one coding are left out. Null when
 * there is nothing to compare, or every coding has the same value (no
 * disagreement is expected, so none can be measured). Ordinal and interval
 * values must be numbers.
 */
export function krippendorffAlpha(codings: readonly Coding[], metric: AlphaMetric): number | null {
  const units = pairable(codings);
  if (units.length === 0) return null;
  const values = [...new Set(units.flat())];
  if (metric !== "nominal") values.sort((a, b) => Number(a) - Number(b));
  const index = new Map(values.map((v, i) => [v, i]));
  const size = values.length;

  // The coincidence matrix: o[c][k] counts the pairs of values c, k within units, each unit weighing 1 per coding
  const o = new Float64Array(size * size);
  for (const unit of units) {
    const counts = new Map<number, number>();
    for (const v of unit) {
      const i = index.get(v)!;
      counts.set(i, (counts.get(i) ?? 0) + 1);
    }
    const weight = 1 / (unit.length - 1);
    for (const [c, nc] of counts)
      for (const [k, nk] of counts) o[c * size + k] += nc * (c === k ? nk - 1 : nk) * weight;
  }
  const n = new Float64Array(size);
  for (let c = 0; c < size; c++) for (let k = 0; k < size; k++) n[c] += o[c * size + k];
  const total = n.reduce((a, b) => a + b, 0);

  // Ordinal distance: the number of values between c and k (cumulative counts)
  const cumulative = new Float64Array(size + 1);
  for (let c = 0; c < size; c++) cumulative[c + 1] = cumulative[c] + n[c];
  const delta = (c: number, k: number): number => {
    if (c === k) return 0;
    if (metric === "nominal") return 1;
    if (metric === "interval") return (Number(values[c]) - Number(values[k])) ** 2;
    const [lo, hi] = c < k ? [c, k] : [k, c];
    return (cumulative[hi + 1] - cumulative[lo] - (n[lo] + n[hi]) / 2) ** 2;
  };

  let observed = 0;
  let expected = 0;
  for (let c = 0; c < size; c++)
    for (let k = 0; k < size; k++) {
      const d = delta(c, k);
      if (d === 0) continue;
      observed += o[c * size + k] * d;
      expected += n[c] * n[k] * d;
    }
  if (expected === 0) return null;
  return 1 - ((total - 1) * observed) / expected;
}

/** The share of pairs of coders of the same unit who gave the same value. Null without such pairs. */
export function percentAgreement(codings: readonly Coding[]): number | null {
  let pairs = 0;
  let agree = 0;
  for (const unit of pairable(codings)) {
    const counts = new Map<string | number, number>();
    for (const v of unit) counts.set(v, (counts.get(v) ?? 0) + 1);
    pairs += (unit.length * (unit.length - 1)) / 2;
    for (const count of counts.values()) agree += (count * (count - 1)) / 2;
  }
  return pairs === 0 ? null : agree / pairs;
}

/**
 * Cohen's kappa of two coders over the units they both coded (values as
 * categories): agreement beyond what their own frequencies give by chance.
 * Null without shared units, or when chance agreement is certain.
 */
export function cohensKappa(
  a: ReadonlyMap<string | number, string | number>,
  b: ReadonlyMap<string | number, string | number>,
): number | null {
  let shared = 0;
  let agree = 0;
  const freqA = new Map<string | number, number>();
  const freqB = new Map<string | number, number>();
  for (const [unit, va] of a) {
    if (!b.has(unit)) continue;
    const vb = b.get(unit)!;
    shared++;
    if (va === vb) agree++;
    freqA.set(va, (freqA.get(va) ?? 0) + 1);
    freqB.set(vb, (freqB.get(vb) ?? 0) + 1);
  }
  if (shared === 0) return null;
  let chance = 0;
  for (const [value, count] of freqA) chance += (count / shared) * ((freqB.get(value) ?? 0) / shared);
  if (chance === 1) return null;
  return (agree / shared - chance) / (1 - chance);
}

/** Two coders' agreement over the units they both coded. */
export interface PairAgreement {
  a: number;
  b: number;
  /** Units both coded. */
  units: number;
  /** The share of those units with the same value. */
  percent: number;
  kappa: number | null;
}

/** Every pair of coders who coded units in common: Cohen's kappa and percent agreement (a < b). */
export function pairAgreement(codings: readonly Coding[]): PairAgreement[] {
  const byCoder = new Map<number, Map<string | number, string | number>>();
  for (const coding of codings) {
    let mine = byCoder.get(coding.coder);
    if (!mine) byCoder.set(coding.coder, (mine = new Map()));
    mine.set(coding.unit, coding.value);
  }
  const coders = [...byCoder.keys()].sort((x, y) => x - y);
  const result: PairAgreement[] = [];
  for (let i = 0; i < coders.length; i++)
    for (let j = i + 1; j < coders.length; j++) {
      const a = byCoder.get(coders[i])!;
      const b = byCoder.get(coders[j])!;
      let units = 0;
      let agree = 0;
      for (const [unit, value] of a) {
        if (!b.has(unit)) continue;
        units++;
        if (b.get(unit) === value) agree++;
      }
      if (units === 0) continue;
      result.push({ a: coders[i], b: coders[j], units, percent: agree / units, kappa: cohensKappa(a, b) });
    }
  return result;
}

/** How one coder agrees with the others. */
export interface CoderAgreement {
  coder: number;
  /** Units they coded that others coded too. */
  units: number;
  /** The share of their pairs with other coders (same unit) with the same value. */
  percent: number | null;
  /** Cohen's kappa with each other coder, averaged weighing by shared units (the pairs: `pairAgreement`). */
  kappa: number | null;
}

/** Per coder who shares units with others: their agreement with them. */
export function coderAgreement(codings: readonly Coding[]): CoderAgreement[] {
  const byCoder = new Map<number, Map<string | number, string | number>>();
  const byUnit = new Map<string | number, Coding[]>();
  for (const coding of codings) {
    let mine = byCoder.get(coding.coder);
    if (!mine) byCoder.set(coding.coder, (mine = new Map()));
    mine.set(coding.unit, coding.value);
    const unit = byUnit.get(coding.unit);
    if (unit) unit.push(coding);
    else byUnit.set(coding.unit, [coding]);
  }
  const result: CoderAgreement[] = [];
  for (const [coder, mine] of byCoder) {
    let units = 0;
    let pairs = 0;
    let agree = 0;
    const partners = new Map<number, number>();
    for (const [unit, value] of mine) {
      const others = byUnit.get(unit)!.filter((c) => c.coder !== coder);
      if (others.length === 0) continue;
      units++;
      for (const other of others) {
        pairs++;
        if (other.value === value) agree++;
        partners.set(other.coder, (partners.get(other.coder) ?? 0) + 1);
      }
    }
    if (units === 0) continue;
    let weighted = 0;
    let weights = 0;
    for (const [partner, shared] of partners) {
      const kappa = cohensKappa(mine, byCoder.get(partner)!);
      if (kappa === null) continue;
      weighted += kappa * shared;
      weights += shared;
    }
    result.push({ coder, units, percent: agree / pairs, kappa: weights === 0 ? null : weighted / weights });
  }
  return result;
}
