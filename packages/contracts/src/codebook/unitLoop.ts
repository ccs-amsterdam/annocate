import { z } from "zod";
import { SafeNameSchema } from "../common.js";

// How a unit_loop gets its units (docs/architecture.md §6). The codebook
// describes the *process* only: it refers to unitsets by name and to coders
// only through coder-level variables. Which units are in a unitset, and which
// coder has which variable value (e.g. via an invitation), lives outside the
// codebook, so a codebook can be shared and reproduced without revealing
// either.

/** Unitset name meaning "every unit in the job". */
export const ALL_UNITS_UNITSET = "__all__";

/**
 * A dynamic source draws from a queue shared by all coders, until units are
 * saturated. A unit is complete once `minCoders` coders finished it and, if
 * `agreement` is set, `agreement.minAgree` of them gave the same answer -- or,
 * regardless, once `maxCoders` coders finished it.
 */
export const DynamicSourceSchema = z
  .object({
    /** Default 1. */
    minCoders: z.number().int().min(1).optional(),
    maxCoders: z.number().int().min(1).optional(),
    agreement: z
      .object({
        /** A question inside this unit_loop; its answer is compared across coders. */
        variable: SafeNameSchema,
        minAgree: z.number().int().min(2),
      })
      .optional(),
    /**
     * `cover`: prefer the least-coded units (every unit gets coded before any
     * is saturated). `saturate`: prefer units closest to completion
     * (finished units arrive quickly). Default `cover`.
     */
    priority: z.enum(["cover", "saturate"]).optional(),
    /** A unit handed to a coder is reserved for them this long (default 900), then returns to the queue. */
    leaseSeconds: z.number().int().positive().optional(),
  })
  .refine((d) => !d.agreement || d.maxCoders !== undefined, {
    message: "maxCoders is required with an agreement rule (otherwise a unit nobody agrees on is coded forever)",
    path: ["maxCoders"],
  })
  .refine((d) => d.maxCoders === undefined || d.maxCoders >= Math.max(d.minCoders ?? 1, d.agreement?.minAgree ?? 0), {
    message: "maxCoders must be at least minCoders and agreement.minAgree",
    path: ["maxCoders"],
  });
export type DynamicSource = z.infer<typeof DynamicSourceSchema>;

/** A dynamic source with its defaults filled in. */
export function dynamicSourceDefaults(d: DynamicSource) {
  return { ...d, minCoders: d.minCoders ?? 1, priority: d.priority ?? "cover", leaseSeconds: d.leaseSeconds ?? 900 };
}

export const UnitSourceSchema = z.object({
  /**
   * Unitset name, or `__all__` for every unit in the job. May contain
   * `{variable}` placeholders, filled with the coder's value for that
   * coder-level variable (e.g. `part_{slot}`).
   */
  unitset: z.string().min(1),
  /** Absent: fixed (the coder gets every unit of the set). Present: dynamic. */
  dynamic: DynamicSourceSchema.optional(),
});
export type UnitSource = z.infer<typeof UnitSourceSchema>;

/**
 * `{ variable: value }` or `{ variable: [values] }`; several keys must all
 * match. Values are compared with the coder's code for that coder-level
 * variable. Declarative on purpose: evaluated by the job server, readable
 * without a JS engine.
 */
export const UnitBranchConditionSchema = z.record(SafeNameSchema, z.union([z.string(), z.array(z.string()).min(1)]));
export type UnitBranchCondition = z.infer<typeof UnitBranchConditionSchema>;

export const UnitBranchSchema = z.object({
  /** Absent = always matches. The first matching branch wins. */
  when: UnitBranchConditionSchema.optional(),
  sources: z.array(UnitSourceSchema).min(1, "A branch needs at least one unit source"),
});
export type UnitBranch = z.infer<typeof UnitBranchSchema>;

/** Loop-level distribution settings, shared by `unit_loop` items. */
export const UnitLoopDistributionShape = {
  /** First matching branch is used for a coder (and sticks, even if their answers change later). */
  units: z.array(UnitBranchSchema).min(1, "A unit_loop needs at least one branch"),
  /**
   * `random`: per-coder shuffle, with units of all sources interleaved.
   * `sequential` (default): source by source, in unitset order.
   */
  order: z.enum(["sequential", "random"]).optional(),
  /** Max units per coder for this loop, across all sources. */
  maxUnits: z.number().int().positive().optional(),
};

/**
 * Converts the pre-2026-10 loop shape (`unitset` + `randomizeUnits`) into
 * `units`/`order`, so stored codebooks keep parsing.
 */
export function migrateLegacyUnitLoop(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const item = raw as Record<string, unknown>;
  if (item.type !== "unit_loop" || "units" in item) return raw;
  const { unitset, randomizeUnits, ...rest } = item;
  return {
    ...rest,
    units: [{ sources: [{ unitset: typeof unitset === "string" && unitset !== "" ? unitset : ALL_UNITS_UNITSET }] }],
    ...(randomizeUnits ? { order: "random" } : {}),
  };
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

/** Variable names used as `{placeholders}` in a unitset name. */
export function unitsetPlaceholders(unitset: string): string[] {
  return [...unitset.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

/** Fills `{placeholders}`; returns null if a value is missing. */
export function resolveUnitsetName(unitset: string, values: Record<string, string | undefined>): string | null {
  let missing = false;
  const name = unitset.replace(PLACEHOLDER, (_, variable: string) => {
    const value = values[variable];
    if (value === undefined) missing = true;
    return value ?? "";
  });
  return missing ? null : name;
}

/** Whether a unitset name could be produced by a (possibly `{placeholder}`-containing) source unitset. */
export function unitsetMatchesSource(sourceUnitset: string, name: string): boolean {
  const pattern = sourceUnitset
    .split(PLACEHOLDER)
    .map((part, i) => (i % 2 === 1 ? ".+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${pattern}$`).test(name);
}

/** Whether a branch condition matches the coder's variable codes. */
export function branchMatches(when: UnitBranchCondition | undefined, values: Record<string, string | undefined>) {
  if (!when) return true;
  return Object.entries(when).every(([variable, expected]) => {
    const value = values[variable];
    return value !== undefined && (Array.isArray(expected) ? expected.includes(value) : expected === value);
  });
}
