import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { CodebookCodesSchema, CodebookSwipeCodesSchema } from "./codes.js";
import { VAR_PROPERTIES } from "./references.js";

// Shared question/instruction presentation fields.
export const VariableBaseSchema = z.object({
  question: z
    .string()
    .describe("The question shown to the annotator: a markdown template with $var references and {{ }} (in a loop also $unit/$const)."),
  questionStyle: z.record(z.string(), z.string()).optional(),
  instruction: z.string().optional().describe("Extra instructions for this variable; a markdown template like `question`."),
  instructionStyle: z.record(z.string(), z.string()).optional(),
  instructionAuto: z
    .boolean()
    .optional()
    .describe("If true, the instruction is automatically shown the first time this variable appears."),
});

export const VariableItemSchema = z.object({
  name: SafeNameSchema.refine((name) => !(VAR_PROPERTIES as readonly string[]).includes(name), {
    message: `Item names can't be ${VAR_PROPERTIES.join(", ")} (they are reference properties: $var.q.code)`,
  }).describe("Sub-item name, referenced as $var.<question>.<item>.code / .value."),
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
 * An "auto" variable: assigned rather than asked. Used for experimental
 * conditions and for routing coders to unitsets (unit_loop `when` and
 * `$var` references in unitset names, see unitLoop.ts). Assigned once, on the server, when the
 * coder starts, and never changed by the coder afterwards.
 *
 * - `random`:    a (weighted) random draw from `options`
 * - `balanced`:  the option fewest coders have so far (e.g. spread coders over parts)
 * - `invite`:    the value preset on the coder's invitation; if the invitation
 *                doesn't set it, `fallback` decides (default: no value)
 * - `url_param`: the value of a query parameter of the page the coder opened
 *                (the client sends them as `x-url-params`); stored when the
 *                coder starts, so later visits don't need it. If `options`
 *                are given, other values are ignored.
 */
export const AutoTypeSchema = z
  .object({
    type: z.literal("auto"),
    source: z.enum(["random", "balanced", "invite", "url_param"]),
    /** Required when source = "url_param": the URL query param to read the value from. */
    urlParam: z.string().optional(),
    /** The possible values. Required for random/balanced/invite. */
    options: z
      .array(z.object({ code: z.string().min(1), weight: z.number().positive().optional() }))
      .optional(),
    /** For source = "invite": how to assign a value when the invitation doesn't set one. */
    fallback: z.enum(["random", "balanced"]).optional(),
  })
  .refine((v) => v.source === "url_param" || (v.options?.length ?? 0) > 0, {
    message: "options are required for random, balanced and invite sources",
    path: ["options"],
  });

// ---- annotation-in-unit answer types (only valid on unit_variable items) ----

export const SpanTypeSchema = VariableBaseSchema.extend({
  type: z.literal("span"),
  column: z
    .string()
    .describe(
      "The unit data column (or layout `constants` entry) to select spans in -- must be rendered as " +
        "`$unit.<column>::tokenize` (or `$const.<name>::tokenize`) in the unit_loop's layout template (docs/client.md §3)",
    ),
  codes: CodebookCodesSchema,
  editMode: z.boolean().optional(),
  selectionMode: z.enum(["word", "character"]).optional(),
  gaps: z.boolean().optional(),
});
export type SpanType = z.infer<typeof SpanTypeSchema>;

export const RelationOptionsSchema = z.object({
  variable: z.string(),
  values: z.array(z.string()).optional(),
});
export type RelationOptions = z.infer<typeof RelationOptionsSchema>;
export const RelationTypeSchema = VariableBaseSchema.extend({
  type: z.literal("relation"),
  codes: CodebookCodesSchema,
  from: RelationOptionsSchema,
  to: RelationOptionsSchema,
  editMode: z.boolean().optional(),
});
export type RelationType = z.infer<typeof RelationTypeSchema>;

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
 * sense in the context of a unit (see CONTRACTS.md).
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
