import { z } from "zod";
import { ClientIdSchema } from "./common.js";
import { SpecialKindSchema } from "./design/options.js";

// The coder-submitted "answer" for a single question: one
// JSON-serializable value.
//
// Answers hold option values, never labels (docs/client.md §4): what a
// variable's `type` stores is one of `values` (nominal, ordinal, numeric,
// scale, annotinder, random), `spans` or `relations`; confirm stores none.

/**
 * One answer: an option value (or a number, or text), for a scale per item;
 * or a special answer of the question (`special`), with its code as the
 * value if it has one, else without a value (missing).
 */
export const ValueAnswerSchema = z
  .object({
    value: z.union([z.string(), z.number()]).optional(),
    /** The scale item this answer is for. */
    item: z.string().optional(),
    special: SpecialKindSchema.optional(),
  })
  .refine((a) => a.value !== undefined || a.special !== undefined, { message: "An answer has a value or is special" });
export type ValueAnswer = z.infer<typeof ValueAnswerSchema>;

/** The longest comment a coder can add to an answer, a span or a relation. */
export const MAX_COMMENT_LENGTH = 2000;
/** A coder's comment (docs/client.md §4 "Comments"): a question's `comments` allows it. */
const CommentSchema = z.string().max(MAX_COMMENT_LENGTH).optional();

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
  value: z.string(),
  slices: z.array(SpanSliceSchema).min(1),
  comment: CommentSchema,
});
export type SpanAnswer = z.infer<typeof SpanAnswerSchema>;

/** Answer entry for `relation` variable types -- links two span answers by their client id. */
export const RelationAnswerSchema = z.object({
  id: ClientIdSchema,
  fromId: ClientIdSchema,
  toId: ClientIdSchema,
  value: z.string(),
  comment: CommentSchema,
});
export type RelationAnswer = z.infer<typeof RelationAnswerSchema>;

export const VariableValueSchema = z.object({
  done: z.boolean().default(false),
  skip: z.boolean().default(false),
  values: z.array(ValueAnswerSchema).optional(),
  spans: z.array(SpanAnswerSchema).optional(),
  relations: z.array(RelationAnswerSchema).optional(),
  /** The coder's comment on the answer (span and relation questions: on each span or relation). */
  comment: CommentSchema,
});
export type VariableValue = z.infer<typeof VariableValueSchema>;

/** Milliseconds, as the browser measured them: at most a day per question (longer is noise). */
const ms = z
  .number()
  .int()
  .nonnegative()
  .max(24 * 60 * 60 * 1000);

/**
 * How long a coder took on one question, measured in the browser
 * (docs/coder-identity.md §10): from the question being on screen to its
 * first answer (`firstMs`; null if they left it without answering), all
 * the time it was on screen over every visit (`totalMs`), the part of that
 * the page was hidden (`hiddenMs`: another tab, a minimized window; not in
 * `totalMs`), and how often the answer changed (`edits`). For analysis and
 * spotting bad faith; the server's own times bound it (a browser can lie).
 */
export const AnswerTimingSchema = z.object({
  firstMs: ms.nullable(),
  totalMs: ms,
  hiddenMs: ms,
  edits: z.number().int().nonnegative().max(10_000),
  /** A practice question (checked in the browser): the answers given until right; 1 is right the first time. */
  tries: z.number().int().positive().max(10_000).optional(),
});
export type AnswerTiming = z.infer<typeof AnswerTimingSchema>;

/**
 * Body for `POST /variables/unit`: a finished unit, i.e. a value for every
 * question of the loop (`skip` for questions a condition hid).
 */
export const PostUnitVariablesSchema = z.object({
  unitId: z.number().int().positive(),
  /** The unit_loop the unit was coded in (needed when a unit is in more than one loop). */
  loop: z.string().optional(),
  variables: z.record(z.string(), VariableValueSchema),
  /** Per question of the unit, how long the coder took (`AnswerTiming`). */
  timings: z.record(z.string(), AnswerTimingSchema).optional(),
});

/**
 * Body for `POST /variables/coder`: the coder's study-level (non-unit)
 * answers as the client has them; the server writes those that changed.
 */
export const PostCoderVariablesSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
  /** For the questions answered (or visited) since the last post: how long the coder took. */
  timings: z.record(z.string(), AnswerTimingSchema).optional(),
});
