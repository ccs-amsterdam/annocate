import { z } from "zod";
import { IdSchema } from "./common.js";

// Set groups (docs/plans/sets-and-session-parameters.md §1): a group is a
// column of the units; each unit's cell names the set(s) it is in, e.g.
// `s1`, `s1;s2`, or `s1#3;s2#1` (positions). The codebook refers to a group
// by name, and to a set as `{ group, set }`. Names starting with `_` are
// reserved: `_overlap`, the units every coder of the group codes too.

/** The set of a group whose units every coder of the group codes besides their own set. */
export const OVERLAP_SET = "_overlap";

/** Reserved set names (a leading `_`). */
export const RESERVED_SETS = [OVERLAP_SET] as const;

/** A group's name: like a field (letters, digits, `_`), not starting with `_`. */
export const SetGroupNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "A group's name is letters, digits and _, starting with a letter");

/** A set's name: no `;` or `#` (the cell format), and `_` only for reserved sets. */
export const SetNameSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((s) => !/[;#]/.test(s) && s.trim() === s, "A set's name has no ; or #, and no spaces at its ends")
  .refine((s) => !s.startsWith("_") || (RESERVED_SETS as readonly string[]).includes(s), "Set names starting with _ are reserved (_overlap)");

/** A set of a group, as the codebook refers to it. */
export const SetRefSchema = z.object({ group: SetGroupNameSchema, set: SetNameSchema });
export type SetRef = z.infer<typeof SetRefSchema>;

/**
 * One set of a group: its units in order. `ordered`: the order was given
 * (positions); otherwise it is the units' order.
 */
export const UnitSetSchema = z.object({
  name: SetNameSchema,
  unitIds: z.array(IdSchema),
  ordered: z.boolean().default(false),
});
export type UnitSet = z.infer<typeof UnitSetSchema>;

/** Body of `PUT /job/:jobId/sets/:group`: the group's sets (replacing what it had). */
export const SetGroupWriteSchema = z.object({ sets: z.array(UnitSetSchema) });
export type SetGroupWrite = z.input<typeof SetGroupWriteSchema>;

/** A group with its sets (`GET /job/:jobId/sets`). */
export const SetGroupResponseSchema = z.object({ name: SetGroupNameSchema, sets: z.array(UnitSetSchema) });
export type SetGroupResponse = z.infer<typeof SetGroupResponseSchema>;

/** One entry of a cell: a set, and the unit's position in it if given. */
export interface SetCellEntry {
  set: string;
  position?: number;
}

/**
 * Reads a cell of a set column: `s1`, `s1;s2`, `s1#3;s2#1`. Empty: in no
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
    if (!Number.isInteger(position) || position < 1) return { error: `"${part}": the position after # is a whole number from 1` };
    entries.push({ set, position });
  }
  const sets = entries.map((e) => e.set);
  const twice = sets.find((s, i) => sets.indexOf(s) !== i);
  if (twice !== undefined) return { error: `"${cell}": set ${twice} twice` };
  return entries;
}

/** Writes a cell of a set column (positions when the set is ordered). */
export function formatSetCell(entries: SetCellEntry[]): string {
  return entries.map((e) => (e.position === undefined ? e.set : `${e.set}#${e.position}`)).join(";");
}

/**
 * The sets of a group from its column: per unit the cell (units in the
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

/** The cells of a group's column, by unit id (positions for ordered sets). */
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
 * Divides units into `sets` sets (`s1` .. `sN`), after setting aside the
 * overlap (`_overlap`): a number of units, or a fraction of them. Seeded,
 * so it is reproducible; sets differ in size by at most one unit.
 */
export function splitIntoSets<T>(
  units: T[],
  options: { sets: number; overlapUnits?: number; overlapFraction?: number; shuffle?: boolean; seed?: number; prefix?: string },
): { name: string; units: T[] }[] {
  const ids = options.shuffle === false ? [...units] : seededShuffle(units, options.seed ?? 0);
  const overlapN = Math.min(ids.length, options.overlapUnits ?? Math.round((options.overlapFraction ?? 0) * ids.length));
  const overlap = ids.slice(0, overlapN);
  const rest = ids.slice(overlapN);
  const n = Math.max(1, options.sets);
  const base = Math.floor(rest.length / n);
  const extra = rest.length % n;
  const out: { name: string; units: T[] }[] = [];
  let offset = 0;
  for (let p = 0; p < n; p++) {
    const size = base + (p < extra ? 1 : 0);
    out.push({ name: `${options.prefix ?? "s"}${p + 1}`, units: rest.slice(offset, offset + size) });
    offset += size;
  }
  if (overlap.length > 0) out.push({ name: OVERLAP_SET, units: overlap });
  return out;
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

/** The key the server and its tables use for a set: `group/set`. */
export const setKey = (group: string, set: string) => `${group}/${set}`;

/**
 * Adds new units to a group's sets (not `_overlap`), shuffled (seeded):
 * `distribute` spreads them over the existing sets, smallest first, so the
 * sets stay about equal; `new` makes new sets the average size of the
 * existing ones, named on from the existing names (`s4`, `s5`, ... after
 * `s1` to `s3`). Ordered sets get the units at their end.
 */
export function addToSets(sets: UnitSet[], unitIds: number[], mode: "distribute" | "new", seed = 0): UnitSet[] {
  const own = sets.filter((s) => s.name !== OVERLAP_SET);
  const ids = seededShuffle(unitIds, seed);
  if (ids.length === 0) return sets;
  if (mode === "distribute" && own.length > 0) {
    const next = sets.map((s) => ({ ...s, unitIds: [...s.unitIds] }));
    const targets = next.filter((s) => s.name !== OVERLAP_SET);
    for (const id of ids) targets.reduce((a, b) => (b.unitIds.length < a.unitIds.length ? b : a)).unitIds.push(id);
    return next;
  }
  const average = own.length > 0 ? Math.max(1, Math.round(own.reduce((n, s) => n + s.unitIds.length, 0) / own.length)) : ids.length;
  const count = Math.max(1, Math.round(ids.length / average));
  // Names on from the highest `<prefix><n>` (default `s`)
  const numbered = own.map((s) => /^(.*?)(\d+)$/.exec(s.name)).filter((m): m is RegExpExecArray => m !== null);
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
