import { z } from "zod";
import { IdSchema } from "./common.js";
import { VariableValueSchema } from "./variableValue.js";

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
  /** Cohen's kappa with each other coder, averaged weighing by shared units. */
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
  /** Every pair of coders with units in common (by session id, a < b): Cohen's kappa and percent agreement. */
  pairs: z.array(
    z.object({
      a: IdSchema,
      b: IdSchema,
      units: z.number().int().positive(),
      percent: z.number(),
      kappa: z.number().nullable(),
    }),
  ),
});
export type QuestionAgreement = z.infer<typeof QuestionAgreementSchema>;

/** `GET /study/:studyId/results/agreement`. */
export const ResultsAgreementSchema = z.object({ questions: z.array(QuestionAgreementSchema) });
export type ResultsAgreement = z.infer<typeof ResultsAgreementSchema>;

/** A unit two or more coders answered, and how much their answers differ (0: all the same). */
export const ResultUnitSchema = z.object({
  unitId: IdSchema,
  externalId: z.string(),
  loop: z.string(),
  coders: z.number().int().positive(),
  /** Averaged over the loop's questions: the share of pairs of coders who answered differently. */
  disagreement: z.number().min(0).max(1),
});
export type ResultUnit = z.infer<typeof ResultUnitSchema>;

/** `GET /study/:studyId/results/units`: most disagreement first. */
export const ResultsUnitsSchema = z.object({ units: z.array(ResultUnitSchema) });
export type ResultsUnits = z.infer<typeof ResultsUnitsSchema>;

/** `GET /study/:studyId/results/units/:unitId`: the unit as its coders saw it, and their answers. */
export const ResultsUnitSchema = z.object({
  unitId: IdSchema,
  externalId: z.string(),
  /** The unit versions its coders saw (usually one). */
  versions: z.array(z.object({ id: IdSchema, data: z.record(z.string(), z.unknown()) })),
  answers: z.array(
    z.object({
      sessionId: IdSchema,
      coder: z.string().nullable(),
      variable: z.string(),
      value: VariableValueSchema,
      unitVersionId: IdSchema.nullable(),
    }),
  ),
});
export type ResultsUnit = z.infer<typeof ResultsUnitSchema>;

/** One coder session's work: units, time per unit, practice tries. */
export const ResultCoderSchema = z.object({
  sessionId: IdSchema,
  coder: z.string().nullable(),
  /** Units they answered in loops. */
  units: z.number().int().nonnegative(),
  /** The median of their time per unit (the questions' on-screen times added up); null without timings. */
  medianUnitSeconds: z.number().nullable(),
  /** Practice questions: the answers they needed on average until right (1: right the first time); null without practice. */
  practiceTries: z.number().nullable(),
});
export type ResultCoder = z.infer<typeof ResultCoderSchema>;

/** `GET /study/:studyId/results/coders`. */
export const ResultsCodersSchema = z.object({ coders: z.array(ResultCoderSchema) });
export type ResultsCoders = z.infer<typeof ResultsCodersSchema>;

/** `POST /study/:studyId/results/export`: a short-lived link to the study's raw export (docs/plans/exports-and-files.md). */
export const ResultsExportSchema = z.object({
  /** Relative to the server (`/api/files/...`) or, later, a storage service's link. No login needed: the link is the key. */
  url: z.string(),
  expires: z.coerce.date(),
  /** Bytes. */
  size: z.number().int().nonnegative(),
});
export type ResultsExport = z.infer<typeof ResultsExportSchema>;

/** The raw export's `manifest.json`, written last: its counts say every file is complete. */
export const ResultsExportManifestSchema = z.object({
  format: z.literal("annotinder-results-export"),
  formatVersion: z.number().int().positive(),
  study: z.object({ id: IdSchema, name: z.string() }),
  exported: z.coerce.date(),
  release: z.string(),
  /** Rows per file (`answers.jsonl`, `units.jsonl`, ...). */
  counts: z.record(z.string(), z.number().int().nonnegative()),
});
export type ResultsExportManifest = z.infer<typeof ResultsExportManifestSchema>;
