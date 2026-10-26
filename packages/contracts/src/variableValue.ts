import { z } from "zod";
import { ClientIdSchema } from "./common.js";

// The coder-submitted "answer" for a single codebook variable: one
// JSON-serializable value (replacing the old app's `Annotation` /
// `VariableAnnotations` rows).
//
// TODO: tighten this to a discriminated union keyed by the variable's
// `type` (see codebook/variableTypes.ts), e.g. together with the planned
// nominal/ordinal/numeric answer types (TODO.txt). For now all three answer
// shapes are optional siblings, since a given variable's `type` only ever
// populates one of them.

/** Answer for "code"-style variable types: select_code/search_code/scale/annotinder/confirm/auto. */
export const CodeAnswerSchema = z.object({
  /** Set when the variable has `items` (see codebook/variableTypes.ts VariableItemsSchema) -- one answer per item. */
  item: z.string().optional(),
  code: z.string().optional(),
  value: z.number().optional(),
});

/** A single contiguous text fragment within a span answer. */
export const SpanSliceSchema = z.object({
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  /**
   * The exact substring of `field` at `[offset, offset + length)`.
   * Stored in each slice so downstream analysis has direct access to the annotated text.
   */
  text: z.string(),
});
export type SpanSlice = z.infer<typeof SpanSliceSchema>;

/**
 * Answer entry for `span` variable types.
 * Supports both continuous spans (single slice) and discontinuous spans with gaps (multiple slices).
 */
export const SpanAnswerSchema = z.object({
  id: ClientIdSchema,
  field: z.string(),
  code: z.string(),
  slices: z.array(SpanSliceSchema).min(1),
});
export type SpanAnswer = z.infer<typeof SpanAnswerSchema>;

/** Answer entry for `relation` variable types -- links two span answers by their client id. */
export const RelationAnswerSchema = z.object({
  id: ClientIdSchema,
  fromId: ClientIdSchema,
  toId: ClientIdSchema,
  code: z.string(),
});
export type RelationAnswer = z.infer<typeof RelationAnswerSchema>;

export const VariableValueSchema = z.object({
  done: z.boolean().default(false),
  skip: z.boolean().default(false),
  codes: z.array(CodeAnswerSchema).optional(),
  spans: z.array(SpanAnswerSchema).optional(),
  relations: z.array(RelationAnswerSchema).optional(),
});
export type VariableValue = z.infer<typeof VariableValueSchema>;

/**
 * Body for `POST /variables/unit`: a finished unit, i.e. a value for every
 * question of the loop (`skip` for questions a condition hid).
 */
export const PostUnitVariablesSchema = z.object({
  unitId: z.number().int().positive(),
  /** The unit_loop the unit was coded in (needed when a unit is in more than one loop). */
  loop: z.string().optional(),
  variables: z.record(z.string(), VariableValueSchema),
});

/** Body for `POST /variables/coder` -- full replace of one coder's job-level (non-unit) variables. */
export const PostCoderVariablesSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
});
