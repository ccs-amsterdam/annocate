import { z } from "zod";
import { SafeNameSchema } from "../common";
import { PositionSchema } from "./position";
import { UnitLayoutSchema } from "./layout";
import { UserVariableTypeSchema, UnitVariableTypeSchema } from "./variableTypes";

// The flat, positional codebook item model (design plan §2, replacing the
// old normalized DAG of `codebookNodes`). Every item type shares `position`
// (see position.ts) and `name` (unique per codebook, used as the storage key
// for variable values on user_variable/unit_variable items, and as a
// reference target for `condition` expressions on any item type).

const ItemBaseSchema = z.object({
  position: PositionSchema,
  name: SafeNameSchema,
});

/**
 * A leaf item that always results in a stored coder-level (non-unit)
 * variable value. Cannot appear inside a unit_loop (see codebook.ts nesting
 * rules).
 */
export const UserVariableItemSchema = ItemBaseSchema.extend({
  type: z.literal("user_variable"),
  variable: UserVariableTypeSchema,
});

/**
 * A leaf item that results in a stored per-unit, per-coder variable value.
 * Must appear inside a unit_loop.
 */
export const UnitVariableItemSchema = ItemBaseSchema.extend({
  type: z.literal("unit_variable"),
  variable: UnitVariableTypeSchema,
});

/**
 * A `for unit in unitset` loop. References one of the job's unitsets by
 * name. Must have children (other items positioned directly/indirectly
 * beneath it); those children must all eventually be unit_variable or
 * condition items -- never user_variable or another unit_loop.
 */
export const UnitLoopItemSchema = ItemBaseSchema.extend({
  type: z.literal("unit_loop"),
  unitset: z.string().describe("The name of the job's unitset this loop iterates over"),
  layout: UnitLayoutSchema,
  randomizeUnits: z.boolean().optional().describe("If true, randomize unit order per coder"),
});

/**
 * An `if <expression>:` gate. Its children (positioned beneath it) are only
 * shown to the coder if the expression evaluates to true. May appear
 * anywhere (inside or outside a unit_loop) and may be nested.
 */
export const ConditionItemSchema = ItemBaseSchema.extend({
  type: z.literal("condition"),
  expression: z.string().describe("A JS-like boolean expression, evaluated against prior variable values"),
});

export const CodebookItemSchema = z.discriminatedUnion("type", [
  UserVariableItemSchema,
  UnitVariableItemSchema,
  UnitLoopItemSchema,
  ConditionItemSchema,
]);
export type CodebookItem = z.infer<typeof CodebookItemSchema>;
