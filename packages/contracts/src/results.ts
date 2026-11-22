import { z } from "zod";
import { IdSchema } from "./common.js";

// The researcher's look at the answers so far (docs/plans/results-viewer.md):
// counts per question and agreement per question, computed by the server
// from the live answers under the deployed design.

const ValueSchema = z.union([z.string(), z.number()]);

/** How coders answered one question (a scale: one item). */
export const QuestionAnswersSchema = z.object({
  question: z.string(),
  /** A scale's item; null otherwise. */
  item: z.string().nullable(),
  /** The unit loop's key (contracts `unitLoops`); null for questions outside loops. */
  loop: z.string().nullable(),
  /** The answer type (`nominal`, `ordinal`, ...). */
  type: z.string(),
  /** Answers given (one per coder, or per unit and coder in a loop). */
  answered: z.number().int().nonnegative(),
  /** Answers a condition skipped. */
  skipped: z.number().int().nonnegative(),
  /** Per value (option, number or span label): how often it was given, most often first. Several answers count each. */
  counts: z.array(z.object({ value: ValueSchema, count: z.number().int().positive() })),
});
export type QuestionAnswers = z.infer<typeof QuestionAnswersSchema>;

/** `GET /study/:studyId/results/answers`. */
export const ResultsAnswersSchema = z.object({ questions: z.array(QuestionAnswersSchema) });
export type ResultsAnswers = z.infer<typeof ResultsAnswersSchema>;

/** How one coder agrees with the others on a question (contracts agreement.ts `coderAgreement`). */
export const CoderAgreementRowSchema = z.object({
  sessionId: IdSchema,
  /** The session's coder id, if any. */
  coder: z.string().nullable(),
  units: z.number().int().nonnegative(),
  percent: z.number().nullable(),
  kappa: z.number().nullable(),
});
export type CoderAgreementRow = z.infer<typeof CoderAgreementRowSchema>;

/**
 * Agreement on one unit-loop question, over units two or more coders
 * answered. A question with several answers has a row per option (given or
 * not); a span question a row per label (each word labelled or not).
 */
export const QuestionAgreementSchema = z.object({
  question: z.string(),
  item: z.string().nullable(),
  /** The option or label this row is about (several answers, spans); null: the question's value. */
  option: ValueSchema.nullable(),
  loop: z.string(),
  type: z.string(),
  metric: z.enum(["nominal", "ordinal", "interval"]),
  /** Krippendorff's alpha; null when there is nothing to compare or no variation. */
  alpha: z.number().nullable(),
  /** The share of pairs of coders of a unit who agree. */
  percent: z.number().nullable(),
  /** Units (for spans: words) with two or more coders. */
  units: z.number().int().nonnegative(),
  coders: z.array(CoderAgreementRowSchema),
});
export type QuestionAgreement = z.infer<typeof QuestionAgreementSchema>;

/** `GET /study/:studyId/results/agreement`. */
export const ResultsAgreementSchema = z.object({ questions: z.array(QuestionAgreementSchema) });
export type ResultsAgreement = z.infer<typeof ResultsAgreementSchema>;
