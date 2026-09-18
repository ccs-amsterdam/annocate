import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { CodebookCodesSchema, CodebookSwipeCodesSchema } from "./codes.js";

// Shared question/instruction presentation fields, ported from
// CodebookVariableBaseSchema in old/src/.../variableSchemas.ts.
export const VariableBaseSchema = z.object({
  question: z.string().describe("The question shown to the annotator. Supports markdown and scripts."),
  questionStyle: z.record(z.string(), z.string()).optional(),
  instruction: z.string().optional().describe("Extra instructions for this variable. Supports markdown and scripts."),
  instructionStyle: z.record(z.string(), z.string()).optional(),
  instructionAuto: z
    .boolean()
    .optional()
    .describe("If true, the instruction is automatically shown the first time this variable appears."),
});

export const VariableItemSchema = z.object({
  name: SafeNameSchema.describe("Sub-item name, concatenated with the variable name (variable.item)."),
  label: z.string().max(128).optional(),
});
export const VariableItemsSchema = z
  .array(VariableItemSchema)
  .optional()
  .refine((items) => !items || new Set(items.map((i) => i.name)).size === items.length, {
    message: "Item names must be unique",
  });

// ---- "code" style answer types (select/search/scale/annotinder/confirm) ----

export const AnnotinderTypeSchema = VariableBaseSchema.extend({
  type: z.literal("annotinder"),
  codes: CodebookSwipeCodesSchema,
});

export const ScaleTypeSchema = VariableBaseSchema.extend({
  type: z.literal("scale"),
  codes: CodebookCodesSchema,
  items: VariableItemsSchema,
});

export const SelectCodeTypeSchema = VariableBaseSchema.extend({
  type: z.literal("select_code"),
  codes: CodebookCodesSchema,
  multiple: z.boolean().optional(),
  vertical: z.boolean().optional(),
});

export const SearchCodeTypeSchema = VariableBaseSchema.extend({
  type: z.literal("search_code"),
  codes: CodebookCodesSchema,
  multiple: z.boolean().optional(),
});

export const ConfirmTypeSchema = VariableBaseSchema.extend({
  type: z.literal("confirm"),
});

/**
 * NEW variable type (did not exist in old design, see design plan §2/§10.b):
 * an "auto" variable whose value is assigned automatically rather than asked
 * of the coder -- either a random draw (e.g. for experimental condition
 * assignment) or read from a URL parameter at session start.
 */
export const AutoTypeSchema = z.object({
  type: z.literal("auto"),
  source: z.enum(["random", "url_param"]),
  /** Required when source = "url_param": the URL query param to read the value from. */
  urlParam: z.string().optional(),
  /** Required when source = "random": the possible values to draw from (optionally weighted). */
  options: z
    .array(z.object({ code: z.string(), weight: z.number().positive().optional() }))
    .optional(),
});

// ---- annotation-in-unit answer types (only valid on unit_variable items) ----

export const SpanTypeSchema = VariableBaseSchema.extend({
  type: z.literal("span"),
  codes: CodebookCodesSchema,
  editMode: z.boolean().optional(),
});

export const RelationOptionsSchema = z.object({
  variable: z.string(),
  values: z.array(z.string()).optional(),
});
export const RelationTypeSchema = VariableBaseSchema.extend({
  type: z.literal("relation"),
  codes: CodebookCodesSchema,
  from: RelationOptionsSchema,
  to: RelationOptionsSchema,
  editMode: z.boolean().optional(),
});

/** The answer types allowed on a `user_variable` item (see codebook/item.ts). */
export const UserVariableTypeSchema = z.discriminatedUnion("type", [
  AnnotinderTypeSchema,
  ScaleTypeSchema,
  SelectCodeTypeSchema,
  SearchCodeTypeSchema,
  ConfirmTypeSchema,
  AutoTypeSchema,
]);
export type UserVariableType = z.infer<typeof UserVariableTypeSchema>;

/**
 * The answer types allowed on a `unit_variable` item: everything a
 * user_variable supports, plus span/relation annotation types that only make
 * sense in the context of a unit (see design plan §2).
 */
export const UnitVariableTypeSchema = z.discriminatedUnion("type", [
  AnnotinderTypeSchema,
  ScaleTypeSchema,
  SelectCodeTypeSchema,
  SearchCodeTypeSchema,
  ConfirmTypeSchema,
  SpanTypeSchema,
  RelationTypeSchema,
]);
export type UnitVariableType = z.infer<typeof UnitVariableTypeSchema>;
