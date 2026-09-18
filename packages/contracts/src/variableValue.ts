import { z } from "zod";
import { ClientIdSchema } from "./common.js";

// The coder-submitted "answer" for a single codebook variable (design plan
// §2's "variable(s)" -- replacing the old, more granular `Annotation` /
// `VariableAnnotations` DB rows with a single JSON-serializable value).
//
// TODO(phase 3): tighten this to a discriminated union keyed by the
// variable's `type` (see codebook/variableTypes.ts) once JobManager is
// ported and the exact per-type shape needs are confirmed by real usage. For
// now all three answer shapes are optional siblings, since a given
// variable's `type` only ever populates one of them.

/** Answer for "code"-style variable types: select_code/search_code/scale/annotinder/confirm/auto. */
export const CodeAnswerSchema = z.object({
  /** Set when the variable has `items` (see codebook/variableTypes.ts VariableItemsSchema) -- one answer per item. */
  item: z.string().optional(),
  code: z.string().optional(),
  value: z.number().optional(),
});

/** Answer entry for `span` variable types. */
export const SpanAnswerSchema = z.object({
  id: ClientIdSchema,
  field: z.string(),
  offset: z.number().int(),
  length: z.number().int(),
  code: z.string(),
  /**
   * The selected text itself, i.e. the exact substring `field`'s raw string
   * value at `[offset, offset + length)` -- included so downstream analysis
   * doesn't need to re-fetch/re-slice the unit data to know what was
   * annotated (design plan §11f/2026-09-18). Redundant with
   * `field`+`offset`+`length` by construction (always kept in sync by the
   * client when the span is created), but small and convenient.
   */
  text: z.string(),
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
  /**
   * Reserved for the HMAC-signed answer-validation scheme (design plan §4).
   * Not implemented/enforced yet (deferred to hardening phase); kept as an
   * optional field now so the contract shape doesn't need a breaking change
   * later.
   */
  proof: z.string().optional(),
  codes: z.array(CodeAnswerSchema).optional(),
  spans: z.array(SpanAnswerSchema).optional(),
  relations: z.array(RelationAnswerSchema).optional(),
});
export type VariableValue = z.infer<typeof VariableValueSchema>;

/** Body for `POST /variables/unit` -- full replace of one coder's variables for one unit. */
export const PostUnitVariablesSchema = z.object({
  unitId: z.number().int().positive(),
  variables: z.record(z.string(), VariableValueSchema),
});

/** Body for `POST /variables/coder` -- full replace of one coder's job-level (non-unit) variables. */
export const PostCoderVariablesSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
});
