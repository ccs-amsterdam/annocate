import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import type { AnyVariableType } from "./variableTypes.js";
import { SetNameSchema } from "../sets.js";

// How a unit_loop gets its units (docs/architecture.md §6.2,
// docs/plans/unit-sets.md). Who the coders are is the study's coder unit
// assignment's (session.ts `invite`): expert coders by the units'
// `coder_set`, or a crowd; an experiment can select units by
// `condition_set`. A loop works within a coder's units: one part of the
// study (`part`, a value of `part_set`), the coding units yes or no, where
// the test units (`test_set`: overlap, practice, gold) go (left out,
// before, after or spread throughout), the checks on practice and gold
// units, and for a crowd whether the units are divided among the coders (a
// shared queue) or every coder codes all of them. A later loop can instead
// take the units a coder got in the previous loop (`sameAsPrevious`). The
// design refers to the columns' values by name; which units have them
// lives with the units, so a design can be shared and reproduced without
// revealing them.

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

/** The key for "every unit in the study" (the server's sets are keyed `column/set`, `setKey`). */
export const ALL_UNITS_SET = "__all__";

/**
 * The default rate of test units (placement `rate`, docs/architecture.md
 * §6.2): about one per `every` own units, at random (seeded per coder: a
 * reload gives the same order) but never more than 2 x `every` apart, so it
 * works without knowing how many units a coder gets (a shared queue).
 * Test units left when the coder's own units run out come at the end.
 */
export const DEFAULT_RATE = 10;

/**
 * Where a loop puts test units (`test_set`: overlap, practice, gold) among
 * the coding units: left out (`ignore`), `before` or `after` them, or
 * `spread` evenly throughout them (in a shared queue without a maximum of
 * units per coder: about one in ten, at random). A test unit with a part
 * (`part_set`) is only in the loops of that part; without one, in every loop.
 */
export const PlacementSchema = z.enum(["ignore", "before", "after", "spread"]);
export type Placement = z.infer<typeof PlacementSchema>;

/**
 * The checks on practice units (docs/architecture.md §6.2): for the
 * `questions` listed, a unit's right answer is in its column
 * `answer_<question>` (optional per unit), and its own feedback in
 * `feedback_<question>` (optional). Checked in the browser as each
 * question is answered: a wrong answer shows the feedback, and the coder
 * answers again until right (`retry`, the default) or may go on. How many
 * tries it took is stored with the answer's timing.
 */
export const PracticeCheckSchema = z.object({
  questions: z.array(SafeNameSchema).max(20).optional(),
  /** Shown when an answer is wrong (unless the unit has its own message): a template that may use $var and $unit. Default: the expected answer. */
  message: z.string().max(2000).optional(),
  /** Coders answer a wrong question again until right (default); false: they see the feedback and may go on. */
  retry: z.boolean().optional(),
});
export type PracticeCheck = z.infer<typeof PracticeCheckSchema>;

/**
 * The checks on gold units (docs/architecture.md §6.2), silent: for each of
 * `questions`, the unit's column `answer_<question>` has the right answer.
 * With `health`: a score that starts at `start`, changes by `wrong` for a
 * wrong answer and by `right` for a right one (never above `start`); at 0 or
 * below the session ends at the end item `end` (a screen-out).
 */
export const GoldCheckSchema = z.object({
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
export type GoldCheck = z.infer<typeof GoldCheckSchema>;

/** Answer types a gold or practice question can have: compared by value (a confirmation has none). */
export const CHECKABLE_TYPES = ["nominal", "ordinal", "annotinder", "numeric"] as const;

/**
 * Dividing a loop's units among a crowd's coders (`divide`): the loop's
 * units are a shared queue among the coders with the same units (those of
 * one link), handed out until done. A unit is done once `codersPerUnit.min` coders coded it,
 * or, with `until`, once `until.agree` coders gave the same answer to the
 * question `until.on`; it is never handed out to more than
 * `codersPerUnit.max` coders (except to a coder below
 * `unitsPerCoder.min`). Each coder gets at most `unitsPerCoder.max` units
 * (besides the test units).
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
 * Which of a coder's units a loop includes (docs/architecture.md §6.2): one
 * part of the study (`part`: the units with this value in `part_set`;
 * absent: every unit), the coding units or not (`coding`, default
 * yes), where the test units go (default `spread`), with the checks on
 * practice and gold units; for a crowd, `divide`: the coding units are a
 * shared queue (else every coder codes all of them); `sameAsPrevious`: the
 * coding units are those the coder finished in the previous loop, in that
 * order (a third loop with it takes the second's, so the first's). Absent: all of them.
 */
export const LoopUnitsSchema = z.object({
  part: SetNameSchema.optional(),
  coding: z.boolean().optional(),
  overlap: PlacementSchema.optional(),
  practice: PlacementSchema.optional(),
  gold: PlacementSchema.optional(),
  practiceCheck: PracticeCheckSchema.optional(),
  goldCheck: GoldCheckSchema.optional(),
  divide: CriteriaSchema.optional(),
  sameAsPrevious: z.boolean().optional(),
});
export type LoopUnits = z.infer<typeof LoopUnitsSchema>;

/** A loop's units settings (`{}` when absent: all the coder's units, test units spread throughout). */
export const loopUnits = (loop: { units?: LoopUnits }): LoopUnits => loop.units ?? {};

/**
 * How the server hands out a loop's units: the loop's settings (a crowd's
 * shared queue, `criteria`), and the test units' placements as the
 * distribution works with them (`first`, `last`, `spread`, or `rate`: about
 * one in `every`, for a shared queue without a maximum of units per coder).
 */
export interface ResolvedLoopUnits {
  /** Only the units of this part (`part_set`). */
  part?: string;
  /** The coding units are included (else only test units). */
  own: boolean;
  criteria?: Criteria;
  /** The key of the previous loop, whose units (per coder) this loop takes. */
  sameAs?: string;
  overlap?: ResolvedPlacement;
  practice?: ResolvedPlacement & PracticeCheck;
  gold?: ResolvedPlacement & { questions?: string[]; health?: GoldCheck["health"] };
}
export interface ResolvedPlacement {
  placement: "first" | "last" | "spread" | "rate" | "disabled";
  every?: number;
  rest?: "end" | "drop";
}

/**
 * A loop's units as the server hands them out (`ResolvedLoopUnits`): its
 * settings; `crowd`: the coders are a crowd (only then are units divided).
 * Taking the previous loop's units, the units aren't divided again. `key`:
 * the loop's (contracts `unitLoops`).
 */
export function effectiveLoopUnits(loop: { units?: LoopUnits }, crowd: boolean, key: string): ResolvedLoopUnits {
  const u = loopUnits(loop);
  const previous = u.sameAsPrevious && Number(key) > 1 ? String(Number(key) - 1) : undefined;
  const shared = crowd && previous === undefined ? u.divide : undefined;
  const place = (p: Placement | undefined): ResolvedPlacement => {
    switch (p ?? "spread") {
      case "ignore":
        return { placement: "disabled" };
      case "before":
        return { placement: "first" };
      case "after":
        return { placement: "last" };
      default:
        // A shared queue without a maximum: where "spread" would put them isn't known
        return shared && shared.unitsPerCoder?.max === undefined
          ? { placement: "rate", every: DEFAULT_RATE, rest: "end" }
          : { placement: "spread" };
    }
  };
  const practice = place(u.practice);
  const gold = place(u.gold);
  return {
    ...(u.part ? { part: u.part } : {}),
    own: u.coding ?? true,
    ...(shared ? { criteria: shared } : {}),
    ...(previous !== undefined ? { sameAs: previous } : {}),
    overlap: place(u.overlap),
    ...(practice.placement === "disabled" ? {} : { practice: { ...practice, ...u.practiceCheck } }),
    ...(gold.placement === "disabled" ? {} : { gold: { ...gold, ...u.goldCheck } }),
  };
}

/** A loop's queue settings with their defaults filled in (null: no shared queue, the coder codes all their units). */
export function sharedDefaults(b: ResolvedLoopUnits) {
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
  /** Which of the coder's units the loop includes, and where test units go. Absent: all of them. */
  units: LoopUnitsSchema.optional(),
  /** `random`: each coder gets the units (and the overlap units) in their own random order. Default `sequential`: the units' order. */
  order: z.enum(["sequential", "random"]).optional(),
};
