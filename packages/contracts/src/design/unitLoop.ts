import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import type { AnyVariableType } from "./variableTypes.js";
import { SetGroupNameSchema } from "../sets.js";

// How a unit_loop gets its units (docs/architecture.md §6.2). Who
// gets which units is decided per session, not per loop: by the coder column
// and the conditions linked to set columns (session.ts, the random
// condition). A loop works within the session's units: an optional filter
// on a set column, optional distribution criteria (a shared queue), and the
// placement of special units. The design refers to set columns and their
// values by name; which units are in them lives with the units, so a
// design can be shared and reproduced without revealing them.

/**
 * Whether coders' answers to a question can be compared for an agreement
 * rule: one categorical answer (nominal without `multiple`, ordinal, or a
 * swipe). For numbers, several answers or scale items "the same answer" is
 * less obvious; not supported until someone needs it.
 */
export function supportsAgreement(variable: AnyVariableType): boolean {
  return (
    (variable.type === "nominal" && !variable.multiple) || variable.type === "ordinal" || variable.type === "annotinder"
  );
}

/** The key for "every unit in the study" (the server's sets are keyed `group/set`, `setKey`). */
export const ALL_UNITS_SET = "__all__";

/** How long a session that hasn't finished counts for balancing (it is active, or started this long ago at most) (ms). */
export const SET_ACTIVITY_MS = 24 * 60 * 60 * 1000;

/**
 * At a rate (docs/architecture.md §6.2): about one special unit per
 * `every` own units, at random (seeded per coder: a reload gives the same
 * order) but never more than 2 x `every` apart, so it works without
 * knowing how many units a coder gets (crowd coding). `rest`: special
 * units left when the coder's own units run out come at the `end`
 * (default: everyone gets them all) or are dropped (`drop`).
 */
export const RateSettings = {
  every: z.number().int().min(2).max(1000).optional(),
  rest: z.enum(["end", "drop"]).optional(),
};
/** The default rate: about one in ten. */
export const DEFAULT_RATE = 10;

/**
 * The overlap: the session's `_overlap` units (in every share of a column),
 * which every coder codes besides their own units, e.g. for intercoder
 * reliability. Without overlap settings they are among the coder's units.
 * `first` or `last` of the coder's units, `spread` evenly through them, at
 * a `rate` (`every`, `rest`), or `disabled`. `expect`: how many overlap
 * units the design wants (a warning when the group has fewer). `max`: use
 * at most this many, the `first` in order or a `random` (seeded) draw.
 */
export const OverlapSettingsSchema = z.object({
  placement: z.enum(["first", "last", "spread", "rate", "disabled"]),
  ...RateSettings,
  expect: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
  pick: z.enum(["first", "random"]).optional(),
});
export type OverlapSettings = z.infer<typeof OverlapSettingsSchema>;

/** Where practice or gold units go among the coder's own units. */
const CheckPlacementSchema = z.enum(["first", "last", "spread", "rate"]);

/**
 * Practice units (docs/architecture.md §6.2): the `_practice` units (of
 * any set column), before the coder's own units by default. For the `questions`
 * listed, a unit's right answer is in its column `<question>_practice`
 * (optional per unit), and its own feedback in `<question>_practice_message`
 * (optional). Checked in the browser as each question is answered: a wrong
 * answer shows the feedback, and the coder answers again until right
 * (`retry`, the default) or may go on. How many tries it took is stored with
 * the answer's timing. Without questions: practice units without feedback.
 */
export const PracticeSettingsSchema = z.object({
  placement: CheckPlacementSchema,
  ...RateSettings,
  questions: z.array(SafeNameSchema).max(20).optional(),
  /** Shown when an answer is wrong (unless the unit has its own message): a template that may use $var and $unit. Default: the expected answer. */
  message: z.string().max(2000).optional(),
  /** Coders answer a wrong question again until right (default); false: they see the feedback and may go on. */
  retry: z.boolean().optional(),
});
export type PracticeSettings = z.infer<typeof PracticeSettingsSchema>;

/**
 * Gold units (docs/architecture.md §6.2): the `_gold` units (of any set column), checked silently: for each of
 * `questions`, the unit's column `<question>_gold` has the right answer.
 * With `health`: a score that starts at `start`, changes by `wrong` for a
 * wrong answer and by `right` for a right one (never above `start`); at 0 or
 * below the session ends at the end item `end` (a screen-out).
 */
export const GoldSettingsSchema = z.object({
  placement: CheckPlacementSchema,
  ...RateSettings,
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

/** The answer column of a checked question on gold and practice units (docs/architecture.md §6.2). */
export const goldColumn = (question: string) => `${question}_gold`;
export const practiceColumn = (question: string) => `${question}_practice`;
export const practiceMessageColumn = (question: string) => `${question}_practice_message`;

/** Answer types a gold or practice question can have: compared by value. */
export const CHECKABLE_TYPES = ["nominal", "ordinal", "annotinder", "numeric", "confirm"] as const;

/**
 * A loop's filter: only the session's units that are (`only`) or aren't
 * (`except`) in these values of a set column. Reserved values count too
 * (`except: ["_overlap"]`).
 */
export const UnitFilterSchema = z
  .object({
    column: SetGroupNameSchema,
    only: z.array(z.string().min(1).max(128)).min(1).max(100).optional(),
    except: z.array(z.string().min(1).max(128)).min(1).max(100).optional(),
  })
  .refine((f) => (f.only === undefined) !== (f.except === undefined), {
    message: "A filter has either only or except values",
    path: ["only"],
  });
export type UnitFilter = z.infer<typeof UnitFilterSchema>;

/**
 * Distribution criteria: the loop's units (within the session's) are a
 * shared queue among the coders with the same units, handed out until done
 * (crowd coding). A unit is done once `codersPerUnit.min` coders coded it,
 * or, with `until`, once `until.agree` coders gave the same answer to the
 * question `until.on`; it is never handed out to more than
 * `codersPerUnit.max` coders (except to a coder below
 * `unitsPerCoder.min`). Each coder gets at most `unitsPerCoder.max` units
 * (besides the special ones).
 */
export const CriteriaSchema = z
  .object({
    codersPerUnit: z
      .object({ min: z.number().int().min(1).optional(), max: z.number().int().min(1).optional() })
      .optional(),
    until: z.object({ agree: z.number().int().min(2), on: SafeNameSchema }).optional(),
    unitsPerCoder: z
      .object({ min: z.number().int().positive().optional(), max: z.number().int().positive().optional() })
      .optional(),
    /**
     * `cover`: prefer the least-coded units (every unit gets coded before any
     * is done). `saturate`: prefer units closest to done (done units arrive
     * quickly). Default `cover`.
     */
    priority: z.enum(["cover", "saturate"]).optional(),
    /** A unit handed to a coder is reserved for them this long (default 900), then returns to the queue. */
    leaseSeconds: z.number().int().positive().optional(),
  })
  .refine((c) => !c.until || c.codersPerUnit?.max !== undefined, {
    message:
      "Set the most coders per unit when coding until coders agree (otherwise a unit nobody agrees on is coded forever)",
    path: ["codersPerUnit", "max"],
  })
  .refine(
    (c) => c.codersPerUnit?.max === undefined || c.codersPerUnit.max >= (c.until?.agree ?? c.codersPerUnit.min ?? 1),
    {
      message: "The most coders per unit must be at least the coders (or agreeing coders) a unit needs",
      path: ["codersPerUnit", "max"],
    },
  )
  .refine((c) => !c.until || c.codersPerUnit?.min === undefined, {
    message: "With until, a unit is done when coders agree: leave out the minimum coders per unit",
    path: ["codersPerUnit", "min"],
  })
  .refine(
    (c) =>
      c.unitsPerCoder?.min === undefined ||
      c.unitsPerCoder.max === undefined ||
      c.unitsPerCoder.min <= c.unitsPerCoder.max,
    {
      message: "The minimum units per coder can't be more than the maximum",
      path: ["unitsPerCoder", "min"],
    },
  );
export type Criteria = z.infer<typeof CriteriaSchema>;

/**
 * How a loop hands out units (docs/architecture.md §6.2): which of
 * the session's units (a filter), and how (criteria, special units). `{}`
 * or absent: all the session's units, once.
 */
export const LoopUnitsSchema = z
  .object({
    filter: UnitFilterSchema.optional(),
    criteria: CriteriaSchema.optional(),
    overlap: OverlapSettingsSchema.optional(),
    practice: PracticeSettingsSchema.optional(),
    gold: GoldSettingsSchema.optional(),
  })
  .refine(
    (b) =>
      !b.criteria ||
      b.criteria.unitsPerCoder?.max !== undefined ||
      ![b.overlap, b.practice, b.gold].some((s) => s?.placement === "spread"),
    {
      message:
        "Spreading special units in a shared queue needs a maximum of units per coder (to know where to put them)",
      path: ["criteria", "unitsPerCoder", "max"],
    },
  );
export type LoopUnits = z.infer<typeof LoopUnitsSchema>;

/** A loop's units settings (`{}` when absent: all the session's units, once). */
export const loopUnits = (loop: { units?: LoopUnits }): LoopUnits => loop.units ?? {};

/** A loop's queue settings with their defaults filled in (null: no criteria, the coder codes all their units). */
export function sharedDefaults(b: LoopUnits) {
  const c = b.criteria;
  if (!c) return null;
  return {
    minCoders: c.until?.agree ?? c.codersPerUnit?.min ?? 1,
    agreement: c.until ? { variable: c.until.on, minAgree: c.until.agree } : undefined,
    maxCoders: c.codersPerUnit?.max,
    priority: c.priority ?? "cover",
    leaseSeconds: c.leaseSeconds ?? 900,
  };
}

/** Loop-level distribution settings, shared by `unit_loop` items. */
export const UnitLoopDistributionShape = {
  /** Which of the session's units the loop hands out and how. Absent: all of them, once. */
  units: LoopUnitsSchema.optional(),
  /** `random`: each coder gets the units (and the overlap units) in their own random order. Default `sequential`: the units' order. */
  order: z.enum(["sequential", "random"]).optional(),
};
