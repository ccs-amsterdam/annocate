import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * A named selection of a job's units (CONTRACTS.md), referenced
 * by a codebook's `unit_loop` items by name. Unit order/randomization
 * is configured directly in the codebook's `unit_loop` item.
 */
export const UnitsetWriteSchema = z.object({
  name: z.string().min(1).max(128),
  unitIds: z.array(IdSchema),
});
export type UnitsetWrite = z.infer<typeof UnitsetWriteSchema>;

export const UnitsetResponseSchema = UnitsetWriteSchema.extend({
  id: IdSchema,
  jobId: IdSchema,
});
export type UnitsetResponse = z.infer<typeof UnitsetResponseSchema>;

/**
 * Options for splitting units into `parts` unitsets (`<prefix>_1` ..
 * `<prefix>_<parts>`), optionally setting aside an overlap set
 * (`<prefix>_overlap`) first, e.g. for intercoder reliability. The client
 * does the split (`splitUnits`) and creates the sets with `POST /unitsets`:
 * ordinary, explicit unitsets, so adding units to the job later does not
 * change them. The server only stores unitsets.
 */
export const GenerateUnitsetsSchema = z
  .object({
    prefix: z.string().regex(/^[a-zA-Z0-9_]+$/, "Prefix must be alphanumeric and underscores only"),
    /** Unitset to split; defaults to all units in the job. */
    from: z.string().optional(),
    parts: z.number().int().min(1).max(1000),
    /** Units set aside for the overlap set: an absolute number ... */
    overlapUnits: z.number().int().nonnegative().optional(),
    /** ... or a fraction of all units (0-1). */
    overlapFraction: z.number().min(0).max(1).optional(),
    /** Shuffle before splitting (seeded, so it is reproducible). Default true. */
    shuffle: z.boolean().optional(),
    seed: z.number().int().optional(),
  })
  .refine((g) => g.overlapUnits === undefined || g.overlapFraction === undefined, {
    message: "Give overlapUnits or overlapFraction, not both",
  });
export type GenerateUnitsets = z.infer<typeof GenerateUnitsetsSchema>;

/**
 * Splits unit ids into parts (and an overlap set), seeded so it is
 * reproducible. Parts differ in size by at most one unit.
 */
export function splitUnits(unitIds: number[], options: Omit<GenerateUnitsets, "prefix" | "from">) {
  const ids = options.shuffle === false ? [...unitIds] : seededShuffle(unitIds, options.seed ?? 0);
  const overlapN = Math.min(
    ids.length,
    options.overlapUnits ?? Math.round((options.overlapFraction ?? 0) * ids.length),
  );
  const overlap = ids.slice(0, overlapN);
  const rest = ids.slice(overlapN);
  const parts: number[][] = Array.from({ length: options.parts }, () => []);
  const base = Math.floor(rest.length / options.parts);
  const extra = rest.length % options.parts;
  let offset = 0;
  for (let p = 0; p < options.parts; p++) {
    const size = base + (p < extra ? 1 : 0);
    parts[p] = rest.slice(offset, offset + size);
    offset += size;
  }
  return { parts, overlap };
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
