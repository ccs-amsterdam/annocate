import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import {
  NominalOptionSchema,
  NominalOptionsSchema,
  noSpecialOptions,
  NO_SPECIAL_MESSAGE,
  OrdinalOptionsSchema,
  SwipeOptionsSchema,
  nominalValueErrors,
} from "./options.js";

// Shared question presentation fields.
export const VariableBaseSchema = z.object({
  question: z
    .string()
    .describe(
      "The question shown to the coder: a markdown template with $var references and {{ }} (in a loop also $unit and [[snippets]]).",
    ),
  questionStyle: z.record(z.string(), z.string()).optional(),
  focus: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "In a unit loop: the parts of the layout this question is about, by id: `unit.<field>` for a unit field, `var.<question>` " +
        "for an answer, or a named ::: block's name (docs/client.md §3). The first is scrolled to and highlighted when the " +
        "question comes up. Default for span questions: their fields.",
    ),
  focusDim: z
    .boolean()
    .optional()
    .describe("Dim the rest of the unit while this question is on screen, so its focus stands out."),
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
  if (v.min !== undefined && v.max !== undefined && v.min >= v.max)
    ctx.addIssue({ code: "custom", message: "min must be below max", path: ["max"] });
  if ((v.layout === "slider" || v.layout === "buttons") && (v.min === undefined || v.max === undefined)) {
    ctx.addIssue({ code: "custom", message: `Layout ${v.layout} needs both min and max`, path: ["layout"] });
  }
  for (const [i, l] of (v.labels ?? []).entries()) {
    if ((v.min !== undefined && l.value < v.min) || (v.max !== undefined && l.value > v.max)) {
      ctx.addIssue({
        code: "custom",
        message: `Label at ${l.value} is outside min..max`,
        path: ["labels", i, "value"],
      });
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
    .refine((items) => new Set(items.map((i) => i.name)).size === items.length, {
      message: "Item names must be unique",
    }),
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
    .describe(
      "In a unit loop: show the unit on a card while this question is asked. Default: the unit as it is (the layout doesn't change between questions); it moves when swiped either way.",
    ),
});
export type AnnotinderType = z.infer<typeof AnnotinderTypeSchema>;

export const ConfirmTypeSchema = VariableBaseSchema.extend({
  type: z.literal("confirm"),
});

/**
 * An experiment's conditions and how they are assigned (an `experiment`
 * item's variable, item.ts): on the server, once, when the coder reaches the
 * item, and never changed afterwards.
 *
 * - `random`:    a (weighted) random draw from `options`
 * - `balanced`:  the option fewest coders have so far
 * - `url_param`: the value of the URL parameter `param` (a URL parameter of
 *   the Study entry, by name, whose values are the conditions); nothing is drawn
 */
export const RandomVariableSchema = z
  .object({
    type: z.literal("random"),
    draw: z.enum(["random", "balanced", "url_param"]),
    /** With `url_param`: the URL parameter (its name in the Study entry) whose value is the condition. */
    param: SafeNameSchema.optional(),
    /** The possible values. Optional with `units`: then the values of `condition_set`, whatever they are. */
    options: z
      .array(NominalOptionSchema.extend({ weight: z.number().positive().optional() }))
      .min(1, "List at least one value")
      .optional(),
    /**
     * Each condition gets its own units (docs/plans/unit-sets.md): those
     * with the condition in the units' `condition_set`, in the loops after
     * this item. At most one experiment selects units.
     */
    units: z.boolean().optional(),
    /**
     * Balanced within groups (stratified): coders count only against coders
     * with the same answers to these earlier coder-level questions, or the
     * same `$session` values (`session.<name>`). E.g. `["gender"]`: the
     * conditions are balanced among women, and among men.
     */
    stratify: z.array(z.string().min(1).max(80)).max(5).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.options && !v.units)
      ctx.addIssue({
        code: "custom",
        message: "List the values, or select units by the units' condition_set",
        path: ["options"],
      });
    if (v.draw === "url_param" && !v.param)
      ctx.addIssue({ code: "custom", message: "Choose the URL parameter with the condition", path: ["param"] });
    if (v.param && v.draw !== "url_param")
      ctx.addIssue({
        code: "custom",
        message: "Only a condition from a URL parameter has a parameter",
        path: ["param"],
      });
    if (v.stratify?.length && v.draw !== "balanced")
      ctx.addIssue({
        code: "custom",
        message: "Only a balanced draw can be balanced within groups",
        path: ["stratify"],
      });
    nominalValueErrors(v.options ?? []).forEach((message) =>
      ctx.addIssue({ code: "custom", message, path: ["options"] }),
    );
  });
export type RandomVariable = z.infer<typeof RandomVariableSchema>;

// ---- annotation-in-unit answer types (only valid inside a unit loop) ----

export const SpanTypeSchema = VariableBaseSchema.extend({
  type: z.literal("span"),
  fields: z
    .array(z.string().min(1))
    .min(1, "Choose what to select in")
    .describe(
      'The unit fields to select spans in (each span records its field), e.g. ["headline", "text"]: fields the layout ' +
        "shows as plain text, `$unit.<field>` (docs/client.md §3)",
    ),
  options: NominalOptionsSchema.refine(noSpecialOptions, NO_SPECIAL_MESSAGE),
  selectionMode: z.enum(["word", "character"]).optional(),
  gaps: z.boolean().optional(),
});
export type SpanType = z.infer<typeof SpanTypeSchema>;

/** One end of a relation rule: spans of a span question (of the same loop), only those with `values` if given. */
export const RelationEndSchema = z.object({
  variable: z.string().describe("The span question (in the same unit loop) whose spans this end can be"),
  /** Only spans with these values (default: all). */
  values: z.array(z.string()).optional(),
});
export type RelationEnd = z.infer<typeof RelationEndSchema>;

/** Which relations can go from which spans to which (docs/client.md §4 "Span and relation answers"). */
export const RelationRuleSchema = z.object({
  from: RelationEndSchema,
  to: RelationEndSchema,
  /** The relation types (option values) this rule allows; default all. */
  options: z.array(z.string()).optional(),
});
export type RelationRule = z.infer<typeof RelationRuleSchema>;

/** Relations between spans: from a span to another, with a relation type (an option), as the rules allow. */
export const RelationTypeSchema = VariableBaseSchema.extend({
  type: z.literal("relation"),
  options: NominalOptionsSchema.refine(noSpecialOptions, NO_SPECIAL_MESSAGE),
  rules: z.array(RelationRuleSchema).min(1, "Add a rule: which spans a relation can go from and to"),
});
export type RelationType = z.infer<typeof RelationTypeSchema>;

/**
 * A question whose answer type isn't chosen yet (a new question). Saving works;
 * validation reports it, so the design can't be previewed or deployed
 * until the researcher chooses a type in the editor.
 */
export const UnspecifiedTypeSchema = VariableBaseSchema.extend({
  type: z.literal("unspecified"),
  question: z.string().optional().describe("The question, if already written."),
});
export type UnspecifiedType = z.infer<typeof UnspecifiedTypeSchema>;

/** The answer types allowed on a coder-level question (see design/item.ts). */
export const UserVariableTypeSchema = z.discriminatedUnion("type", [
  NominalTypeSchema,
  OrdinalTypeSchema,
  NumericTypeSchema,
  ScaleTypeSchema,
  AnnotinderTypeSchema,
  ConfirmTypeSchema,
  UnspecifiedTypeSchema,
]);
export type UserVariableType = z.infer<typeof UserVariableTypeSchema>;

/**
 * The answer types allowed on a question in a unit loop: everything a
 * coder-level question supports, plus span/relation annotation types that
 * only make sense in the context of a unit.
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

/** Any variable an item produces: a question's answer type, or an experiment's conditions (`random`). */
export type AnyVariableType = UnitVariableType | UserVariableType | RandomVariable;
