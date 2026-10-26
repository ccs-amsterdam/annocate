import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { ConditionSchema, type Condition } from "./condition.js";
import { UnitLayoutSchema } from "./layout.js";
import { outputText, parseTemplate, referenceValue, type ReferenceScope } from "./references.js";
import { UnitLoopDistributionShape, migrateLegacyUnitLoop } from "./unitLoop.js";
import { UserVariableTypeSchema, UnitVariableTypeSchema } from "./variableTypes.js";

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
 * Ends the coder's session when the coder reaches it, usually inside a
 * condition: `screenout` (not eligible) or `complete`. Optionally shows a
 * message and sends the coder on, e.g. back to a panel company.
 */
export const EndItemSchema = ItemBaseSchema.extend({
  type: z.literal("end"),
  outcome: z.enum(["screenout", "complete"]),
  message: z.string().optional().describe("Shown at the end: a markdown template like a question text."),
  redirectUrl: z
    .string()
    .optional()
    .describe("Where to send the coder, e.g. a panel's return link. May contain $var references (filled in URL-encoded)."),
});
export type EndItem = z.infer<typeof EndItemSchema>;

/** An end item's redirect URL with its `$var` references filled in, URL-encoded. */
export function fillRedirectUrl(url: string, scope: ReferenceScope): string {
  return parseTemplate(url)
    .segments.map((s) => {
      if (s.type === "text") return s.text.replace(/\\\$/g, "$");
      return s.ref ? encodeURIComponent(outputText(referenceValue(scope, s.ref))) : "";
    })
    .join("");
}

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
 * - Question items (can include span, relation, categorical, etc.)
 * - End items
 * - Condition items (whose children can only be in-loop items)
 */
export type InLoopItem =
  | InLoopQuestionItem
  | LegacyUnitVariableItem
  | EndItem
  | {
      type: "condition";
      name: string;
      condition: Condition;
      children: InLoopItem[];
    };

export const InLoopConditionItemSchema: z.ZodType<Extract<InLoopItem, { type: "condition" }>> = z.lazy(() =>
  ItemBaseSchema.extend({
    type: z.literal("condition"),
    condition: ConditionSchema.describe("A script over earlier answers ($var), and in a loop $unit/$const"),
    children: z.array(InLoopItemSchema).min(1, "Condition must have at least one child item"),
  })
);

export const InLoopItemSchema: z.ZodType<InLoopItem> = z.lazy(() =>
  z.union([InLoopQuestionItemSchema, LegacyUnitVariableItemSchema, EndItemSchema, InLoopConditionItemSchema])
);

/**
 * A `for unit in ...` loop. Which units a coder gets is described by `units`
 * (branches of fixed/dynamic unitset sources, see unitLoop.ts), `order` and
 * `maxUnits`. Children can ONLY be in-loop items (question or in-loop
 * condition). Nested unit loops are strictly disallowed.
 *
 * The legacy `unitset` + `randomizeUnits` shape is migrated on parse.
 */
const UnitLoopObjectSchema = ItemBaseSchema.extend({
  type: z.literal("unit_loop"),
  ...UnitLoopDistributionShape,
  layout: UnitLayoutSchema,
  children: z.array(InLoopItemSchema).min(1, "A unit_loop must have at least one child item"),
});
export const UnitLoopItemSchema = z.preprocess(migrateLegacyUnitLoop, UnitLoopObjectSchema);
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
  | EndItem
  | {
      type: "condition";
      name: string;
      condition: Condition;
      children: TopLevelItem[];
    };

export const TopLevelConditionItemSchema: z.ZodType<Extract<TopLevelItem, { type: "condition" }>> = z.lazy(() =>
  ItemBaseSchema.extend({
    type: z.literal("condition"),
    condition: ConditionSchema.describe("A script over earlier answers ($var), and in a loop $unit/$const"),
    children: z.array(TopLevelItemSchema).min(1, "Condition must have at least one child item"),
  })
);

export const TopLevelItemSchema: z.ZodType<TopLevelItem> = z.lazy(() =>
  z.union([
    TopLevelQuestionItemSchema,
    LegacyUserVariableItemSchema,
    UnitLoopItemSchema,
    EndItemSchema,
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
