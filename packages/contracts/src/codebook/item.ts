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
 * A leaf item that always results in a stored coder-level (non-unit)
 * variable value. Appears only at the top level of a codebook (cannot
 * appear inside a unit_loop).
 */
export const UserVariableItemSchema = ItemBaseSchema.extend({
  type: z.literal("user_variable"),
  variable: UserVariableTypeSchema,
});
export type UserVariableItem = z.infer<typeof UserVariableItemSchema>;

/**
 * A leaf item that results in a stored per-unit, per-coder variable value.
 * Appears only inside a unit_loop.
 */
export const UnitVariableItemSchema = ItemBaseSchema.extend({
  type: z.literal("unit_variable"),
  variable: UnitVariableTypeSchema,
});
export type UnitVariableItem = z.infer<typeof UnitVariableItemSchema>;

/**
 * Items that can appear inside a unit_loop:
 * - Unit variables
 * - Condition items (whose children can only be in-loop items)
 */
export type InLoopItem =
  | UnitVariableItem
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
  z.union([UnitVariableItemSchema, InLoopConditionItemSchema])
);

/**
 * A `for unit in unitset` loop.
 * If `unitset` is omitted or empty, the loop iterates over all units in the job.
 * Children can ONLY be in-loop items (unit_variable or in-loop condition).
 * Nested unit loops and user variables are strictly disallowed.
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
 * - User variables
 * - Unit loops
 * - Top-level condition items (whose children can be any top-level items)
 */
export type TopLevelItem =
  | UserVariableItem
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
  z.union([UserVariableItemSchema, UnitLoopItemSchema, TopLevelConditionItemSchema])
);

/**
 * Any condition item (top level or inside loop).
 */
export type ConditionItem = Extract<TopLevelItem | InLoopItem, { type: "condition" }>;

/**
 * Any codebook item anywhere in the tree.
 */
export type CodebookItem = TopLevelItem | InLoopItem;
