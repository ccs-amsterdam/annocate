import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { ConditionSchema } from "./condition.js";
import type { AnyVariableType } from "./variableTypes.js";
import { outputText, parseTemplate, referenceValue, type ReferenceScope, type Reference } from "./references.js";

// How a unit_loop gets its units (docs/architecture.md §6). The codebook
// describes the *process* only: it refers to unitsets by name and to coders
// only through coder-level variables. Which units are in a unitset, and which
// coder has which variable value (e.g. via an invitation), lives outside the
// codebook, so a codebook can be shared and reproduced without revealing
// either.

/**
 * Whether coders' answers to a question can be compared for an agreement
 * rule: one categorical answer (nominal without `multiple`, ordinal, or a
 * swipe). For numbers, several answers or scale items "the same answer" is
 * less obvious; not supported until someone needs it.
 */
export function supportsAgreement(variable: AnyVariableType): boolean {
  return (variable.type === "nominal" && !variable.multiple) || variable.type === "ordinal" || variable.type === "annotinder";
}

/** Unitset name meaning "every unit in the job". */
export const ALL_UNITS_UNITSET = "__all__";

/** How long a coder of a `sets` branch keeps their set without finishing it or being active (ms). */
export const SET_ACTIVITY_MS = 24 * 60 * 60 * 1000;

/**
 * A set every coder of the branch codes in full besides their own units,
 * e.g. for intercoder reliability (and later gold questions): `before`
 * their units (default), `after` them, or `spread` evenly through them.
 * Spreading needs to know how many units a coder gets: in `shared` mode
 * that is `maxUnits` (required there for `spread`). If a coder gets fewer
 * units, the overlap units left come at the end.
 */
export const OverlapSchema = z.object({
  /** Unitset name; may contain `$var` references, like a branch's `unitset`. */
  unitset: z.string().min(1),
  placement: z.enum(["before", "after", "spread"]).optional(),
});
export type Overlap = z.infer<typeof OverlapSchema>;

const branchBase = {
  /**
   * Absent = always matches. The first matching branch wins. Evaluated by
   * the client, which tells the server the branch it chose.
   */
  when: ConditionSchema.optional(),
  overlap: OverlapSchema.optional(),
};

/**
 * `all`: every coder of the branch codes every unit of the set. The
 * unitset name may contain `$var` references to coder-level questions,
 * filled in with the coder's answer as text (e.g. `part_$var.slot.value`).
 */
export const AllUnitsBranchSchema = z.object({
  ...branchBase,
  mode: z.literal("all"),
  unitset: z.string().min(1),
});

/**
 * `shared`: the units are shared among coders: a queue that hands each unit
 * out until it is done, either when `until.coders` coders coded it, or when
 * `until.agree` coders gave the same answer to the question `until.on` --
 * and in any case once `maxCoders` coded it.
 */
export const SharedBranchSchema = z
  .object({
    ...branchBase,
    mode: z.literal("shared"),
    unitset: z.string().min(1),
    until: z.union([
      z.object({ coders: z.number().int().min(1) }),
      z.object({
        agree: z.number().int().min(2),
        /** A question inside this unit_loop with one categorical answer (`supportsAgreement`). */
        on: SafeNameSchema,
      }),
    ]),
    /**
     * A unit is never handed out to more coders than this (finished codings),
     * except to a coder below `minUnits`. When no unit needs more coders, a
     * coder gets a unit below it. Required with `agree`; without it, `until.coders`.
     */
    maxCoders: z.number().int().min(1).optional(),
    /** At most this many units per coder (besides the overlap). */
    maxUnits: z.number().int().positive().optional(),
    /**
     * At least this many units per coder (besides the overlap): while a
     * coder has fewer, `maxCoders` doesn't hold them back either (with
     * `agree`: units coders don't agree on yet), least-coded units first.
     */
    minUnits: z.number().int().positive().optional(),
    /**
     * `cover`: prefer the least-coded units (every unit gets coded before any
     * is done). `saturate`: prefer units closest to done (done units arrive
     * quickly). Default `cover`.
     */
    priority: z.enum(["cover", "saturate"]).optional(),
    /** A unit handed to a coder is reserved for them this long (default 900), then returns to the queue. */
    leaseSeconds: z.number().int().positive().optional(),
  })
  .refine((b) => !("agree" in b.until) || b.maxCoders !== undefined, {
    message: "Max coders is required when coding until coders agree (otherwise a unit nobody agrees on is coded forever)",
    path: ["maxCoders"],
  })
  .refine((b) => b.maxCoders === undefined || b.maxCoders >= ("agree" in b.until ? b.until.agree : b.until.coders), {
    message: "Max coders must be at least the number of coders (or agreeing coders) a unit needs",
    path: ["maxCoders"],
  })
  .refine((b) => b.minUnits === undefined || b.maxUnits === undefined || b.minUnits <= b.maxUnits, {
    message: "Min units per coder can't be more than max units per coder",
    path: ["minUnits"],
  })
  .refine((b) => b.overlap?.placement !== "spread" || b.maxUnits !== undefined, {
    message: "Spreading the overlap units needs max units per coder (to know where to put them)",
    path: ["overlap", "placement"],
  });
export type SharedBranch = z.infer<typeof SharedBranchSchema>;

/** A shared branch's settings with their defaults filled in. */
export function sharedDefaults(b: SharedBranch) {
  return {
    minCoders: "agree" in b.until ? b.until.agree : b.until.coders,
    agreement: "agree" in b.until ? { variable: b.until.on, minAgree: b.until.agree } : undefined,
    maxCoders: b.maxCoders,
    priority: b.priority ?? "cover",
    leaseSeconds: b.leaseSeconds ?? 900,
  };
}

/**
 * `sets`: each coder gets one of these unitsets, the one with the fewest
 * coders so far. A coder counts for their set while they haven't finished
 * it only if they were active in the last 24 hours (`SET_ACTIVITY_MS`), so
 * sets of coders who dropped out are handed out again.
 */
export const SetsBranchSchema = z.object({
  ...branchBase,
  mode: z.literal("sets"),
  unitsets: z.array(z.string().min(1)).min(1, "Choose at least one unitset"),
});

/**
 * `invitation`: each coder gets the unitset of the invitation they joined
 * with (set on the invitation, e.g. by dividing units over coders). The
 * codebook doesn't say who gets what, so it can be shared without that.
 */
export const InvitationBranchSchema = z.object({
  ...branchBase,
  mode: z.literal("invitation"),
});

export const UnitBranchSchema = z.union([AllUnitsBranchSchema, SharedBranchSchema, SetsBranchSchema, InvitationBranchSchema]);
export type UnitBranch = z.infer<typeof UnitBranchSchema>;
export type UnitMode = UnitBranch["mode"];

/** Loop-level distribution settings, shared by `unit_loop` items. */
export const UnitLoopDistributionShape = {
  /** First matching branch is used for a coder (and sticks, even if their answers change later). */
  units: z.array(UnitBranchSchema).min(1, "Which units coders get isn't set yet: choose how units are handed out"),
  /** `random`: each coder gets the units (and the overlap units) in their own random order. Default `sequential`: unitset order. */
  order: z.enum(["sequential", "random"]).optional(),
};

/**
 * The unitset name templates of a branch, in the order the client fills
 * them in and the server stores them: its own unitset (null in `sets` and
 * `invitation` mode: the server picks it), then the overlap's, if any.
 */
export function branchUnitsets(branch: UnitBranch): (string | null)[] {
  const own = branch.mode === "all" || branch.mode === "shared" ? branch.unitset : null;
  return branch.overlap ? [own, branch.overlap.unitset] : [own];
}

/**
 * What a coder's routing in a loop is stored by: which units a branch hands
 * out (its mode, unitset or sets, and overlap), not where the loop is or
 * what it is called. A coder keeps their routing as long as a branch with
 * the same fingerprint exists; changing these settings routes them again.
 * (Two loops whose branches hand out the same units share it.)
 */
export function branchFingerprint(branch: UnitBranch): string {
  const what = JSON.stringify([branch.mode, ...branchUnitsets(branch), branch.mode === "sets" ? branch.unitsets : null]);
  // FNV-1a, 32 bits: short keys for the stored routing.
  let h = 0x811c9dc5;
  for (let i = 0; i < what.length; i++) h = Math.imul(h ^ what.charCodeAt(i), 0x01000193);
  return `${branch.mode}-${(h >>> 0).toString(36)}`;
}

/** Every unitset name (or name template) a branch refers to, e.g. to tell whether a unitset is in use. */
export function branchUnitsetNames(branch: UnitBranch): string[] {
  const own = branch.mode === "sets" ? branch.unitsets : branch.mode === "invitation" ? [] : [branch.unitset];
  return branch.overlap ? [...own, branch.overlap.unitset] : own;
}

/** The `$var` references in a unitset name (`part_$var.slot.code`). */
export function unitsetReferences(unitset: string): Reference[] {
  return parseTemplate(unitset).segments.flatMap((s) => (s.type === "expression" ? s.references : []));
}

/** Whether a unitset name has references to fill in (the client must choose the branch). */
export function unitsetHasReferences(unitset: string): boolean {
  return parseTemplate(unitset).segments.some((s) => s.type === "expression");
}

/**
 * Fills in a unitset name's references from a scope; null if a value is
 * empty (the coder has no answer) or the name uses `{{ }}`.
 */
export function fillUnitsetName(unitset: string, scope: ReferenceScope): string | null {
  let name = "";
  for (const segment of parseTemplate(unitset).segments) {
    if (segment.type === "text") {
      name += segment.text.replace(/\\\$/g, "$");
      continue;
    }
    if (!segment.ref) return null;
    const value = outputText(referenceValue(scope, segment.ref));
    if (value === "") return null;
    name += value;
  }
  return name;
}

/** Whether a unitset name could be produced by a (possibly `$var`-containing) source unitset. */
export function unitsetMatchesSource(sourceUnitset: string, name: string): boolean {
  const pattern = parseTemplate(sourceUnitset)
    .segments.map((s) => (s.type === "expression" ? ".+" : s.text.replace(/\\\$/g, "$").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${pattern}$`).test(name);
}
