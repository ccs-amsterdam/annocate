import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { ConditionSchema } from "./condition.js";
import type { AnyVariableType } from "./variableTypes.js";
import { SetGroupNameSchema, SetRefSchema } from "../sets.js";

// How a unit_loop gets its units (docs/architecture.md §6,
// docs/plans/sets-and-session-parameters.md §2). The codebook describes the
// *process* only: it refers to set groups and sets by name, and to coders
// only through their answers and session values. Which units are in which
// set lives with the units, so a codebook can be shared and reproduced
// without revealing them.

/**
 * Whether coders' answers to a question can be compared for an agreement
 * rule: one categorical answer (nominal without `multiple`, ordinal, or a
 * swipe). For numbers, several answers or scale items "the same answer" is
 * less obvious; not supported until someone needs it.
 */
export function supportsAgreement(variable: AnyVariableType): boolean {
  return (variable.type === "nominal" && !variable.multiple) || variable.type === "ordinal" || variable.type === "annotinder";
}

/** The key for "every unit in the job" (the server's sets are keyed `group/set`, `setKey`). */
export const ALL_UNITS_UNITSET = "__all__";

/** How long a coder of an `assign` branch with a drawn set keeps their set without finishing it or being active (ms). */
export const SET_ACTIVITY_MS = 24 * 60 * 60 * 1000;

/**
 * The overlap: the `_overlap` units of the branch's group, which every
 * coder codes besides their own set, e.g. for intercoder reliability.
 * `first` or `last` of the coder's units, `spread` evenly through them, or
 * `disabled`. `expect`: how many overlap units the design wants (a
 * warning when the group has fewer). `max`: use at most this many, the
 * `first` in order or a `random` (seeded) draw.
 */
export const OverlapSettingsSchema = z.object({
  placement: z.enum(["first", "last", "spread", "disabled"]),
  expect: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
  pick: z.enum(["first", "random"]).optional(),
});
export type OverlapSettings = z.infer<typeof OverlapSettingsSchema>;

/** Where practice or gold units go among the coder's own units. */
const CheckPlacementSchema = z.enum(["first", "last", "spread"]);

/**
 * Practice units (docs/plans/special-sets.md §2): the group's `_practice`
 * units, before the coder's own units by default. For the `questions`
 * listed, a unit's right answer is in its column `<question>_practice`
 * (optional per unit), and its own feedback in `<question>_practice_message`
 * (optional): coders are told when they are wrong, after answering.
 * Without questions: practice units without feedback.
 */
export const PracticeSettingsSchema = z.object({
  placement: CheckPlacementSchema,
  questions: z.array(SafeNameSchema).max(20).optional(),
  /** Shown when an answer is wrong (unless the unit has its own message): a template that may use $var and $unit. Default: the expected answer. */
  message: z.string().max(2000).optional(),
});
export type PracticeSettings = z.infer<typeof PracticeSettingsSchema>;

/**
 * Gold units (§2): the group's `_gold` units, checked silently: for each of
 * `questions`, the unit's column `<question>_gold` has the right answer.
 * With `health`: a score that starts at `start`, changes by `wrong` for a
 * wrong answer and by `right` for a right one (never above `start`); at 0 or
 * below the session ends at the end item `end` (a screen-out).
 */
export const GoldSettingsSchema = z.object({
  placement: CheckPlacementSchema,
  questions: z.array(SafeNameSchema).min(1, "Choose the questions gold units check").max(20),
  health: z
    .object({
      start: z.number().positive().max(1000),
      wrong: z.number().negative().min(-1000),
      right: z.number().min(0).max(1000).optional(),
      end: SafeNameSchema,
    })
    .optional(),
});
export type GoldSettings = z.infer<typeof GoldSettingsSchema>;

/** The answer column of a checked question on gold and practice units (docs/plans/special-sets.md). */
export const goldColumn = (question: string) => `${question}_gold`;
export const practiceColumn = (question: string) => `${question}_practice`;
export const practiceMessageColumn = (question: string) => `${question}_practice_message`;

/** Answer types a gold or practice question can have: compared by value. */
export const CHECKABLE_TYPES = ["nominal", "ordinal", "annotinder", "numeric", "confirm"] as const;

const branchBase = {
  /**
   * Absent = always matches. The first matching branch wins. Evaluated by
   * the client, which tells the server the branch it chose.
   */
  when: ConditionSchema.optional(),
};

/** `all`: every coder of the branch codes every unit (of the job, or of one set). */
export const AllUnitsBranchSchema = z.object({
  ...branchBase,
  mode: z.literal("all"),
  set: SetRefSchema.optional(),
});

/**
 * `shared`: the units (of the job, or of one set) are shared among coders:
 * a queue that hands each unit out until it is done, either when
 * `until.coders` coders coded it, or when `until.agree` coders gave the
 * same answer to the question `until.on` -- and in any case once
 * `maxCoders` coded it. With a set, the overlap is its group's `_overlap`.
 */
export const SharedBranchSchema = z
  .object({
    ...branchBase,
    mode: z.literal("shared"),
    set: SetRefSchema.optional(),
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
    overlap: OverlapSettingsSchema.optional(),
    practice: PracticeSettingsSchema.optional(),
    gold: GoldSettingsSchema.optional(),
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
  .refine((b) => !b.overlap || b.overlap.placement === "disabled" || b.set !== undefined, {
    message: "An overlap needs a set: it is the _overlap units of the set's group",
    path: ["overlap"],
  })
  .refine((b) => b.overlap?.placement !== "spread" || b.maxUnits !== undefined, {
    message: "Spreading the overlap units needs max units per coder (to know where to put them)",
    path: ["overlap", "placement"],
  })
  .refine((b) => (!b.practice && !b.gold) || b.set !== undefined, {
    message: "Practice and gold units need a set: they are the _practice and _gold units of the set's group",
    path: ["set"],
  })
  .refine((b) => (b.practice?.placement !== "spread" && b.gold?.placement !== "spread") || b.maxUnits !== undefined, {
    message: "Spreading practice or gold units needs max units per coder (to know where to put them)",
    path: ["maxUnits"],
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

/** Session values an `assign` branch can take a set from without declaring them: the login's email, the participant id. */
export const BUILTIN_SET_SOURCES = ["email", "participant"] as const;

/**
 * Where an `assign` branch's set comes from: drawn here (`balanced`: the
 * set with the fewest coders; `random`), or a session value naming the set
 * (a set-typed link or URL parameter of the group, or `email` /
 * `participant`).
 */
export const SetSourceSchema = z.union([
  z.object({ draw: z.enum(["balanced", "random"]) }),
  z.object({ session: SafeNameSchema }),
]);
export type SetSource = z.infer<typeof SetSourceSchema>;

/**
 * `assign`: each coder gets one set of `group` (its sets besides
 * `_overlap`), from `from`, and the group's overlap as `overlap` says
 * (a required, deliberate choice).
 */
export const AssignBranchSchema = z.object({
  ...branchBase,
  mode: z.literal("assign"),
  group: SetGroupNameSchema,
  from: SetSourceSchema,
  overlap: z.object(OverlapSettingsSchema.shape, {
    error: (issue) => (issue.input === undefined ? "Choose the overlap: first, last, spread, or disabled" : undefined),
  }),
  practice: PracticeSettingsSchema.optional(),
  gold: GoldSettingsSchema.optional(),
});
export type AssignBranch = z.infer<typeof AssignBranchSchema>;

export const UnitBranchSchema = z.union([AllUnitsBranchSchema, SharedBranchSchema, AssignBranchSchema]);
export type UnitBranch = z.infer<typeof UnitBranchSchema>;
export type UnitMode = UnitBranch["mode"];

/** Loop-level distribution settings, shared by `unit_loop` items. */
export const UnitLoopDistributionShape = {
  /** First matching branch is used for a coder (and sticks, even if their answers change later). */
  units: z.array(UnitBranchSchema).min(1, "Which units coders get isn't set yet: choose how units are handed out"),
  /** `random`: each coder gets the units (and the overlap units) in their own random order. Default `sequential`: the set's order. */
  order: z.enum(["sequential", "random"]).optional(),
};

/** The group whose `_overlap` a branch uses, if its overlap isn't disabled. */
export function overlapGroup(branch: UnitBranch): string | null {
  if (branch.mode === "assign") return branch.overlap.placement === "disabled" ? null : branch.group;
  if (branch.mode === "shared" && branch.set && branch.overlap && branch.overlap.placement !== "disabled") return branch.set.group;
  return null;
}

/** The group whose special sets (`_overlap`, `_practice`, `_gold`) a branch can use, if any. */
export function branchGroup(branch: UnitBranch): string | null {
  if (branch.mode === "assign") return branch.group;
  if (branch.mode === "shared" && branch.set) return branch.set.group;
  return null;
}

/** The groups a branch uses (for "is this group in use?"). */
export function branchGroups(branch: UnitBranch): string[] {
  if (branch.mode === "assign") return [branch.group];
  return branch.set ? [branch.set.group] : [];
}

/**
 * What a coder's routing in a loop is stored by: which units a branch hands
 * out (its mode, set or group, and where the set comes from), not where the
 * loop is or what it is called. A coder keeps their routing as long as a
 * branch with the same fingerprint exists; changing these settings routes
 * them again. (Two loops whose branches hand out the same units share it.)
 */
export function branchFingerprint(branch: UnitBranch): string {
  const what = JSON.stringify(
    branch.mode === "assign" ? [branch.mode, branch.group, branch.from] : [branch.mode, branch.set ? [branch.set.group, branch.set.set] : null],
  );
  // FNV-1a, 32 bits: short keys for the stored routing.
  let h = 0x811c9dc5;
  for (let i = 0; i < what.length; i++) h = Math.imul(h ^ what.charCodeAt(i), 0x01000193);
  return `${branch.mode}-${(h >>> 0).toString(36)}`;
}
