import { z } from "zod";
import { IdSchema } from "./common.js";

// Unit columns with a role (docs/plans/unit-sets.md): a fixed name says
// what the column does. The set columns (`coder_set`, `condition_set`,
// `part_set`) name per unit the sets it is in, e.g. `anna`, `anna;bob`, or
// `pre#3;post#1` (positions); `test_unit` says whether a unit is a test unit
// (`overlap`, `practice` or `gold`; empty: a coding unit). They are stored
// as sets (per value its units), not in the units' data. Any other column
// is data.

/** Who codes which units (specific coders): coder names or email addresses. */
export const CODER_SET = "coder_set";
/** The units of each condition of the experiment that selects units. */
export const CONDITION_SET = "condition_set";
/** Parts of the study, e.g. `pre` and `post`: a unit loop shows one part. */
export const PART_SET = "part_set";
/** A unit's test type: overlap, practice or gold. */
export const TEST_UNIT = "test_unit";

/** The set columns: a unit can be in several of their sets. */
export const SET_COLUMNS = [CODER_SET, CONDITION_SET, PART_SET] as const;
/** Every column with a role, as stored (per value its units). */
export const ROLE_COLUMNS = [...SET_COLUMNS, TEST_UNIT] as const;
export const RoleColumnSchema = z.enum(ROLE_COLUMNS);
export type RoleColumn = z.infer<typeof RoleColumnSchema>;

/** Whether a column name is one with a role (reserved: never a data column). */
export const isRoleColumn = (name: string): name is RoleColumn => (ROLE_COLUMNS as readonly string[]).includes(name);

/**
 * The test unit types (`test_unit`): overlap units are coded by every coder
 * (besides their own units); practice units tell coders when they are wrong;
 * gold units check them silently (docs/architecture.md §6.2).
 */
export const TEST_UNIT_TYPES = ["overlap", "practice", "gold"] as const;
export const TestUnitTypeSchema = z.enum(TEST_UNIT_TYPES);
export type TestUnitType = z.infer<typeof TestUnitTypeSchema>;

/** A set's name: no `;` or `#` (the cell format), and no spaces at its ends. */
export const SetNameSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((s) => !/[;#]/.test(s) && s.trim() === s, "A set's name has no ; or #, and no spaces at its ends");

/**
 * One set of a role column (a value): its units in order. `ordered`: the order was given
 * (positions); otherwise it is the units' order.
 */
export const UnitSetSchema = z.object({
  name: SetNameSchema,
  unitIds: z.array(IdSchema),
  ordered: z.boolean().default(false),
});
export type UnitSet = z.infer<typeof UnitSetSchema>;

/** Body of `PUT /study/:studyId/sets/:column`: a role column's sets (replacing what it had). */
export const SetGroupWriteSchema = z.object({ sets: z.array(UnitSetSchema) });
export type SetGroupWrite = z.input<typeof SetGroupWriteSchema>;

/** A role column with its sets (`GET /study/:studyId/sets`). */
export const SetGroupResponseSchema = z.object({ name: RoleColumnSchema, sets: z.array(UnitSetSchema) });
export type SetGroupResponse = z.infer<typeof SetGroupResponseSchema>;

/**
 * Why sets can't be a role column's, or null if they can: `test_unit` has
 * only the test unit types as values, and one per unit.
 */
export function roleColumnProblem(column: RoleColumn, sets: readonly UnitSet[]): string | null {
  if (column !== TEST_UNIT) return null;
  const odd = sets.find((s) => !(TEST_UNIT_TYPES as readonly string[]).includes(s.name));
  if (odd) return `'${odd.name}' is not a test unit type (${TEST_UNIT_TYPES.join(", ")})`;
  const seen = new Set<number>();
  for (const set of sets)
    for (const id of set.unitIds) {
      if (seen.has(id)) return "A unit has one test unit type at most";
      seen.add(id);
    }
  return null;
}

/** One entry of a cell: a set, and the unit's position in it if given. */
export interface SetCellEntry {
  set: string;
  position?: number;
}

/**
 * Reads a cell of a role column: `s1`, `s1;s2`, `s1#3;s2#1`. Empty: in no
 * set. Returns an error message for a malformed entry.
 */
export function parseSetCell(cell: string): SetCellEntry[] | { error: string } {
  const entries: SetCellEntry[] = [];
  for (const raw of cell.split(";")) {
    const part = raw.trim();
    if (!part) continue;
    const at = part.lastIndexOf("#");
    const set = (at < 0 ? part : part.slice(0, at)).trim();
    const name = SetNameSchema.safeParse(set);
    if (!name.success) return { error: `"${part}": ${name.error.issues[0].message}` };
    if (at < 0) {
      entries.push({ set });
      continue;
    }
    const position = Number(part.slice(at + 1));
    if (!Number.isInteger(position) || position < 1)
      return { error: `"${part}": the position after # is a whole number from 1` };
    entries.push({ set, position });
  }
  const sets = entries.map((e) => e.set);
  const twice = sets.find((s, i) => sets.indexOf(s) !== i);
  if (twice !== undefined) return { error: `"${cell}": set ${twice} twice` };
  return entries;
}

/** Writes a cell of a role column (positions when the set is ordered). */
export function formatSetCell(entries: SetCellEntry[]): string {
  return entries.map((e) => (e.position === undefined ? e.set : `${e.set}#${e.position}`)).join(";");
}

/**
 * The sets of a role column from its cells: per unit the cell (units in the
 * units' order). A set is ordered when any of its entries has a position:
 * by position, then the units' order.
 */
export function setsFromCells(cells: { unitId: number; cell: string }[]): UnitSet[] | { error: string } {
  const sets = new Map<string, { unitId: number; position?: number; index: number }[]>();
  for (const [index, { unitId, cell }] of cells.entries()) {
    const entries = parseSetCell(cell);
    if ("error" in entries) return entries;
    for (const e of entries) {
      if (!sets.has(e.set)) sets.set(e.set, []);
      sets.get(e.set)!.push({ unitId, position: e.position, index });
    }
  }
  return [...sets].map(([name, members]) => {
    const ordered = members.some((m) => m.position !== undefined);
    const sorted = ordered
      ? [...members].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.index - b.index)
      : members;
    return { name, unitIds: sorted.map((m) => m.unitId), ordered };
  });
}

/** The cells of a role column, by unit id (positions for ordered sets). */
export function cellsFromSets(sets: UnitSet[]): Map<number, string> {
  const entries = new Map<number, SetCellEntry[]>();
  for (const set of sets) {
    set.unitIds.forEach((unitId, i) => {
      if (!entries.has(unitId)) entries.set(unitId, []);
      entries.get(unitId)!.push(set.ordered ? { set: set.name, position: i + 1 } : { set: set.name });
    });
  }
  return new Map([...entries].map(([unitId, e]) => [unitId, formatSetCell(e)]));
}

/**
 * Divides units into `sets` sets (`s1` .. `sN`), e.g. conditions or parts.
 * Seeded, so it is reproducible; sets differ in size by at most one unit.
 */
export function splitIntoSets<T>(
  units: T[],
  options: {
    sets: number;
    shuffle?: boolean;
    seed?: number;
    prefix?: string;
    /** Each unit goes to this many sets (default 1, at most `sets`). */
    perUnit?: number;
  },
): { name: string; units: T[] }[] {
  const shuffled = options.shuffle === false ? [...units] : seededShuffle(units, options.seed ?? 0);
  const n = Math.max(1, options.sets);
  const perUnit = Math.min(n, Math.max(1, Math.floor(options.perUnit ?? 1)));
  const name = (p: number) => `${options.prefix ?? "s"}${p + 1}`;
  if (perUnit > 1) {
    // Unit i to sets i, i+1, ... (mod n): every set gets about as many
    const out = Array.from({ length: n }, (_, p) => ({ name: name(p), units: [] as T[] }));
    shuffled.forEach((unit, i) => {
      for (let j = 0; j < perUnit; j++) out[(i + j) % n].units.push(unit);
    });
    return out;
  }
  const base = Math.floor(shuffled.length / n);
  const extra = shuffled.length % n;
  const out: { name: string; units: T[] }[] = [];
  let offset = 0;
  for (let p = 0; p < n; p++) {
    const size = base + (p < extra ? 1 : 0);
    out.push({ name: name(p), units: shuffled.slice(offset, offset + size) });
    offset += size;
  }
  return out;
}

/**
 * Divides units over named coders (`coder_set`, docs/plans/unit-sets.md):
 * test units aside (`testUnits`, e.g. those of an existing `test_unit`
 * column, and `newTestUnits`: this many units of each type, drawn now),
 * every other unit to `perUnit` coders, each unit to the coders with the
 * fewest so far. Test units are no coder's own: overlap, practice and gold
 * units go to everyone. With `keep`, units a coder already has (e.g. saw
 * while coding) stay theirs first, so redistributing loses nobody's work;
 * such a unit may end up with more coders than `perUnit`. Seeded:
 * reproducible. Returns the coders' sets and the test units drawn.
 */
export function distributeUnits(
  units: number[],
  coders: string[],
  options: {
    perUnit?: number;
    /** Units that are test units already: not given to coders. */
    testUnits?: Iterable<number>;
    /** Test units to draw from the other units, per type. */
    newTestUnits?: Partial<Record<TestUnitType, number>>;
    seed?: number;
    /** Coder -> units to keep with them. */
    keep?: ReadonlyMap<string, Iterable<number>>;
  } = {},
): { sets: { name: string; units: number[] }[]; testUnits: { name: TestUnitType; units: number[] }[]; kept: number } {
  const tests = new Set(options.testUnits ?? []);
  let left = seededShuffle(
    units.filter((u) => !tests.has(u)),
    options.seed ?? 0,
  );
  const testUnits = TEST_UNIT_TYPES.flatMap((name) => {
    const n = Math.min(left.length, Math.max(0, Math.floor(options.newTestUnits?.[name] ?? 0)));
    const taken = left.slice(0, n);
    left = left.slice(n);
    return taken.length > 0 ? [{ name, units: taken }] : [];
  });
  const rest = left;
  const perUnit = Math.min(coders.length, Math.max(1, Math.floor(options.perUnit ?? 1)));
  const assigned = new Map<string, Set<number>>(coders.map((c) => [c, new Set()]));
  const coderCount = new Map<number, number>();
  const inRest = new Set(rest);
  let kept = 0;
  for (const coder of coders)
    for (const unit of options.keep?.get(coder) ?? []) {
      if (!inRest.has(unit) || assigned.get(coder)!.has(unit)) continue;
      assigned.get(coder)!.add(unit);
      coderCount.set(unit, (coderCount.get(unit) ?? 0) + 1);
      kept++;
    }
  for (const unit of rest) {
    for (let need = perUnit - (coderCount.get(unit) ?? 0); need > 0; need--) {
      let best: string | null = null;
      for (const coder of coders) {
        const mine = assigned.get(coder)!;
        if (mine.has(unit)) continue;
        if (best === null || mine.size < assigned.get(best)!.size) best = coder;
      }
      if (best === null) break;
      assigned.get(best)!.add(unit);
      coderCount.set(unit, (coderCount.get(unit) ?? 0) + 1);
    }
  }
  // Each coder's units in the shuffled order
  const order = new Map(rest.map((u, i) => [u, i]));
  const sets = coders.map((name) => ({
    name,
    units: [...assigned.get(name)!].sort((a, b) => order.get(a)! - order.get(b)!),
  }));
  return { sets, testUnits, kept };
}

/** Deterministic shuffle (Mulberry32). */
export function seededShuffle<T>(array: T[], seed: number): T[] {
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

/** The key the server and its tables use for a set: `column/set`. */
export const setKey = (column: string, set: string) => `${column}/${set}`;

/**
 * Adds new units to a column's sets, shuffled (seeded):
 * `distribute` spreads them over the existing sets, smallest first, so the
 * sets stay about equal; `new` makes new sets the average size of the
 * existing ones, named on from the existing names (`s4`, `s5`, ... after
 * `s1` to `s3`). Ordered sets get the units at their end.
 */
export function addToSets(sets: UnitSet[], unitIds: number[], mode: "distribute" | "new", seed = 0): UnitSet[] {
  const ids = seededShuffle(unitIds, seed);
  if (ids.length === 0) return sets;
  if (mode === "distribute" && sets.length > 0) {
    const next = sets.map((s) => ({ ...s, unitIds: [...s.unitIds] }));
    for (const id of ids) next.reduce((a, b) => (b.unitIds.length < a.unitIds.length ? b : a)).unitIds.push(id);
    return next;
  }
  const average =
    sets.length > 0
      ? Math.max(1, Math.round(sets.reduce((n, s) => n + s.unitIds.length, 0) / sets.length))
      : ids.length;
  const count = Math.max(1, Math.round(ids.length / average));
  // Names on from the highest `<prefix><n>` (default `s`)
  const numbered = sets.map((s) => /^(.*?)(\d+)$/.exec(s.name)).filter((m): m is RegExpExecArray => m !== null);
  const prefix = numbered[0]?.[1] ?? "s";
  let n = Math.max(0, ...numbered.filter((m) => m[1] === prefix).map((m) => Number(m[2])));
  const names = new Set(sets.map((s) => s.name));
  const added: UnitSet[] = [];
  for (let i = 0; i < count; i++) {
    do n++;
    while (names.has(`${prefix}${n}`));
    added.push({ name: `${prefix}${n}`, unitIds: ids.filter((_, j) => j % count === i), ordered: false });
  }
  return [...sets, ...added];
}
