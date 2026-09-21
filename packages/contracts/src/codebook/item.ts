import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { UnitLayoutSchema } from "./layout.js";
import {
  UserVariableTypeSchema,
  UnitVariableTypeSchema,
  type UserVariableType,
  type UnitVariableType,
} from "./variableTypes.js";

const ItemBaseSchema = z.object({
  name: SafeNameSchema,
});

/**
 * A question item appearing at the top level of a codebook.
 * Results in a stored coder-level (non-unit) variable value.
 */
export const TopLevelQuestionItemSchema = ItemBaseSchema.extend({
  type: z.literal("question"),
  variable: UserVariableTypeSchema,
});
export type TopLevelQuestionItem = z.infer<typeof TopLevelQuestionItemSchema>;

export const LegacyUserVariableItemSchema = ItemBaseSchema.extend({
  type: z.literal("user_variable"),
  variable: UserVariableTypeSchema,
});
export type LegacyUserVariableItem = z.infer<typeof LegacyUserVariableItemSchema>;

/**
 * A question item appearing inside a unit_loop.
 * Results in a stored per-unit, per-coder variable value.
 */
export const InLoopQuestionItemSchema = ItemBaseSchema.extend({
  type: z.literal("question"),
  variable: UnitVariableTypeSchema,
});
export type InLoopQuestionItem = z.infer<typeof InLoopQuestionItemSchema>;

export const LegacyUnitVariableItemSchema = ItemBaseSchema.extend({
  type: z.literal("unit_variable"),
  variable: UnitVariableTypeSchema,
});
export type LegacyUnitVariableItem = z.infer<typeof LegacyUnitVariableItemSchema>;

/**
 * General Question item schema anywhere in the tree.
 */
export const QuestionItemSchema = ItemBaseSchema.extend({
  type: z.union([z.literal("question"), z.literal("user_variable"), z.literal("unit_variable")]),
  variable: UnitVariableTypeSchema,
});
export type QuestionItem = z.infer<typeof QuestionItemSchema>;

// Backwards-compatible aliases
export const UserVariableItemSchema = TopLevelQuestionItemSchema;
export type UserVariableItem = TopLevelQuestionItem | LegacyUserVariableItem;
export const UnitVariableItemSchema = InLoopQuestionItemSchema;
export type UnitVariableItem = InLoopQuestionItem | LegacyUnitVariableItem;

/**
 * Items that can appear inside a unit_loop:
 * - Question items (can include span, relation, select_code, etc.)
 * - Condition items (whose children can only be in-loop items)
 */
export type InLoopItem =
  | InLoopQuestionItem
  | LegacyUnitVariableItem
  | {
      type: "condition";
      name: string;
      expression: string;
      children: InLoopItem[];
    };

export const InLoopConditionItemSchema: z.ZodType<Extract<InLoopItem, { type: "condition" }>> = z.lazy(() =>
  ItemBaseSchema.extend({
    type: z.literal("condition"),
    expression: z
      .string()
      .describe("A JS boolean expression evaluated against prior variable values"),
    children: z.array(InLoopItemSchema).min(1, "Condition must have at least one child item"),
  })
);

export const InLoopItemSchema: z.ZodType<InLoopItem> = z.lazy(() =>
  z.union([InLoopQuestionItemSchema, LegacyUnitVariableItemSchema, InLoopConditionItemSchema])
);

/**
 * A `for unit in unitset` loop.
 * If `unitset` is omitted or empty, the loop iterates over all units in the job.
 * Children can ONLY be in-loop items (question or in-loop condition).
 * Nested unit loops are strictly disallowed.
 */
export const UnitLoopItemSchema = ItemBaseSchema.extend({
  type: z.literal("unit_loop"),
  unitset: z
    .string()
    .optional()
    .describe("The name of the job's unitset this loop iterates over, or omitted/empty to iterate over all units"),
  layout: UnitLayoutSchema,
  randomizeUnits: z.boolean().optional().describe("If true, randomize unit order per coder"),
  children: z.array(InLoopItemSchema).min(1, "A unit_loop must have at least one child item"),
});
export type UnitLoopItem = z.infer<typeof UnitLoopItemSchema>;

/**
 * Items that can appear at the top level:
 * - Question items (coder-level)
 * - Unit loops
 * - Top-level condition items (whose children can be any top-level items)
 */
export type TopLevelItem =
  | TopLevelQuestionItem
  | LegacyUserVariableItem
  | UnitLoopItem
  | {
      type: "condition";
      name: string;
      expression: string;
      children: TopLevelItem[];
    };

export const TopLevelConditionItemSchema: z.ZodType<Extract<TopLevelItem, { type: "condition" }>> = z.lazy(() =>
  ItemBaseSchema.extend({
    type: z.literal("condition"),
    expression: z
      .string()
      .describe("A JS boolean expression evaluated against prior variable values"),
    children: z.array(TopLevelItemSchema).min(1, "Condition must have at least one child item"),
  })
);

export const TopLevelItemSchema: z.ZodType<TopLevelItem> = z.lazy(() =>
  z.union([
    TopLevelQuestionItemSchema,
    LegacyUserVariableItemSchema,
    UnitLoopItemSchema,
    TopLevelConditionItemSchema,
  ])
);

/**
 * Any condition item (top level or inside loop).
 */
export type ConditionItem = Extract<TopLevelItem | InLoopItem, { type: "condition" }>;

/**
 * Any codebook item anywhere in the tree.
 */
export type CodebookItem = TopLevelItem | InLoopItem;
