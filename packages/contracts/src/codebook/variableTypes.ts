import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import {
  NominalOptionSchema,
  NominalOptionsSchema,
  OrdinalOptionsSchema,
  SwipeOptionsSchema,
  nominalValueErrors,
} from "./options.js";

// Shared question/instruction presentation fields.
export const VariableBaseSchema = z.object({
  question: z
    .string()
    .describe("The question shown to the annotator: a markdown template with $var references and {{ }} (in a loop also $unit and [[snippets]])."),
  questionStyle: z.record(z.string(), z.string()).optional(),
  instruction: z.string().optional().describe("Extra instructions for this variable; a markdown template like `question`."),
  instructionStyle: z.record(z.string(), z.string()).optional(),
  focus: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "In a unit loop: the parts of the layout this question is about, by id: `unit.<field>` for a unit field, `var.<question>` " +
        "for an answer, or a named ::: block's name (docs/client.md §3). The first is scrolled to and highlighted when the " +
        "question comes up. Default for span questions: their fields.",
    ),
  focusDim: z.boolean().optional().describe("Dim the rest of the unit while this question is on screen, so its focus stands out."),
});

export const NOMINAL_LAYOUTS = ["auto", "flex", "row", "grid", "dropdown"] as const;
export type NominalLayout = (typeof NOMINAL_LAYOUTS)[number];
export const ORDINAL_LAYOUTS = ["auto", "row", "grid", "compact", "dropdown"] as const;
export type OrdinalLayout = (typeof ORDINAL_LAYOUTS)[number];

const columnsField = z.number().int().min(1).max(4).optional().describe("Columns of layout grid (default 1).");

/**
 * Nominal: pick one of the options, or several with `multiple`. Values are
 * strings: standardized terms (e.g. `human_interest`), shown by their label.
 */
export const NominalTypeSchema = VariableBaseSchema.extend({
  type: z.literal("nominal"),
  options: NominalOptionsSchema,
  multiple: z.boolean().optional().describe("Several answers."),
  layout: z.enum(NOMINAL_LAYOUTS).optional().describe("Default auto: chosen from the options (resolveLayout)."),
  columns: columnsField,
});
export type NominalType = z.infer<typeof NominalTypeSchema>;

/** Ordinal: pick one of ordered options. Values are numbers rising in option order (default 1..n). */
export const OrdinalTypeSchema = VariableBaseSchema.extend({
  type: z.literal("ordinal"),
  options: OrdinalOptionsSchema,
  layout: z.enum(ORDINAL_LAYOUTS).optional().describe("Default auto: chosen from the options (resolveLayout)."),
  columns: columnsField,
});
export type OrdinalType = z.infer<typeof OrdinalTypeSchema>;

/** The question types that pick from options, laid out the same way. */
export type CategoricalType = NominalType | OrdinalType;

export const NUMERIC_LAYOUTS = ["auto", "input", "slider", "buttons"] as const;
export type NumericLayout = (typeof NUMERIC_LAYOUTS)[number];

/** One number, e.g. a 0-100 thermometer or an age. */
export const NumericTypeSchema = VariableBaseSchema.extend({
  type: z.literal("numeric"),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional().describe("Default 1; 0.1 = one decimal, 5 = steps of five."),
  labels: z
    .array(z.object({ value: z.number(), label: z.string() }))
    .optional()
    .describe("Labels at break points, e.g. 0 'cold', 50 'neutral', 100 'warm'."),
  layout: z.enum(NUMERIC_LAYOUTS).optional().describe("Default auto: chosen from the range (resolveLayout)."),
}).superRefine((v, ctx) => {
  if (v.min !== undefined && v.max !== undefined && v.min >= v.max) ctx.addIssue({ code: "custom", message: "min must be below max", path: ["max"] });
  if ((v.layout === "slider" || v.layout === "buttons") && (v.min === undefined || v.max === undefined)) {
    ctx.addIssue({ code: "custom", message: `Layout ${v.layout} needs both min and max`, path: ["layout"] });
  }
  for (const [i, l] of (v.labels ?? []).entries()) {
    if ((v.min !== undefined && l.value < v.min) || (v.max !== undefined && l.value > v.max)) {
      ctx.addIssue({ code: "custom", message: `Label at ${l.value} is outside min..max`, path: ["labels", i, "value"] });
    }
  }
});
export type NumericType = z.infer<typeof NumericTypeSchema>;

export const ScaleItemSchema = z.object({
  name: SafeNameSchema.describe("Item name, referenced as $var.<question>.items.<item>."),
  label: z.string().max(128).optional(),
});
export type ScaleItem = z.infer<typeof ScaleItemSchema>;

export const SCALE_LAYOUTS = ["auto", "compact", "grid"] as const;
export type ScaleLayout = (typeof SCALE_LAYOUTS)[number];

/** A battery (Likert): several items rated on the same ordinal options. */
export const ScaleTypeSchema = VariableBaseSchema.extend({
  type: z.literal("scale"),
  items: z
    .array(ScaleItemSchema)
    .min(1, "A scale needs at least one item")
    .refine((items) => new Set(items.map((i) => i.name)).size === items.length, { message: "Item names must be unique" }),
  options: OrdinalOptionsSchema,
  layout: z.enum(SCALE_LAYOUTS).optional(),
});
export type ScaleType = z.infer<typeof ScaleTypeSchema>;

/** Swipe a card: 2 or 3 options, in the order left, right, up. */
export const AnnotinderTypeSchema = VariableBaseSchema.extend({
  type: z.literal("annotinder"),
  options: SwipeOptionsSchema,
  card: z
    .boolean()
    .optional()
    .describe("In a unit loop: show the unit on a card while this question is asked. Default: the unit as it is (the layout doesn't change between questions); it moves when swiped either way."),
});
export type AnnotinderType = z.infer<typeof AnnotinderTypeSchema>;

export const ConfirmTypeSchema = VariableBaseSchema.extend({
  type: z.literal("confirm"),
});

/**
 * An "auto" variable: assigned rather than asked, e.g. an experimental
 * condition. Assigned once, on the server, and never changed afterwards.
 * Values a link brings (link and URL parameters) are session parameters
 * instead (`$session`, the Session item).
 *
 * - `random`:    a (weighted) random draw from `options`
 * - `balanced`:  the option fewest coders have so far
 */
export const AutoTypeSchema = z
  .object({
    type: z.literal("auto"),
    source: z.enum(["random", "balanced"]),
    /** The possible values. */
    options: z.array(NominalOptionSchema.extend({ weight: z.number().positive().optional() })).min(1, "List at least one value"),
    /**
     * Balanced within groups (stratified): coders count only against coders
     * with the same answers to these earlier coder-level questions, or the
     * same `$session` values (`session.<name>`). E.g. `["gender"]`: the
     * conditions are balanced among women, and among men.
     */
    stratify: z.array(z.string().min(1).max(80)).max(5).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.stratify?.length && v.source !== "balanced") ctx.addIssue({ code: "custom", message: "Only a balanced draw can be balanced within groups", path: ["stratify"] });
    nominalValueErrors(v.options ?? []).forEach((message) => ctx.addIssue({ code: "custom", message, path: ["options"] }));
  });
export type AutoType = z.infer<typeof AutoTypeSchema>;

// ---- annotation-in-unit answer types (only valid inside a unit loop) ----

export const SpanTypeSchema = VariableBaseSchema.extend({
  type: z.literal("span"),
  fields: z
    .array(z.string().min(1))
    .min(1, "Choose what to select in")
    .describe(
      "The unit fields to select spans in (each span records its field), e.g. [\"headline\", \"text\"]: fields the layout " +
        "shows as plain text, `$unit.<field>` (docs/client.md §3)",
    ),
  options: NominalOptionsSchema,
  selectionMode: z.enum(["word", "character"]).optional(),
  gaps: z.boolean().optional(),
});
export type SpanType = z.infer<typeof SpanTypeSchema>;

export const RelationOptionsSchema = z.object({
  variable: z.string(),
  /** Only spans with these values (default: all). */
  values: z.array(z.string()).optional(),
});
export type RelationOptions = z.infer<typeof RelationOptionsSchema>;
export const RelationTypeSchema = VariableBaseSchema.extend({
  type: z.literal("relation"),
  options: NominalOptionsSchema,
  from: RelationOptionsSchema,
  to: RelationOptionsSchema,
});
export type RelationType = z.infer<typeof RelationTypeSchema>;

/**
 * A question whose answer type isn't chosen yet: what the setup wizard
 * makes from a question name (docs/plans/setup-wizard.md). Saving works;
 * validation reports it, so the codebook can't be previewed or published
 * until the researcher chooses a type in the editor.
 */
export const UnspecifiedTypeSchema = VariableBaseSchema.extend({
  type: z.literal("unspecified"),
  question: z.string().optional().describe("The question, if already written."),
});
export type UnspecifiedType = z.infer<typeof UnspecifiedTypeSchema>;

/** The answer types allowed on a coder-level question (see codebook/item.ts). */
export const UserVariableTypeSchema = z.discriminatedUnion("type", [
  NominalTypeSchema,
  OrdinalTypeSchema,
  NumericTypeSchema,
  ScaleTypeSchema,
  AnnotinderTypeSchema,
  ConfirmTypeSchema,
  AutoTypeSchema,
  UnspecifiedTypeSchema,
]);
export type UserVariableType = z.infer<typeof UserVariableTypeSchema>;

/**
 * The answer types allowed on a question in a unit loop: everything a
 * coder-level question supports except `auto`, plus span/relation
 * annotation types that only make sense in the context of a unit.
 */
export const UnitVariableTypeSchema = z.discriminatedUnion("type", [
  NominalTypeSchema,
  OrdinalTypeSchema,
  NumericTypeSchema,
  ScaleTypeSchema,
  AnnotinderTypeSchema,
  ConfirmTypeSchema,
  SpanTypeSchema,
  RelationTypeSchema,
  UnspecifiedTypeSchema,
]);
export type UnitVariableType = z.infer<typeof UnitVariableTypeSchema>;

export type AnyVariableType = UnitVariableType | UserVariableType;
