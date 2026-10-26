import { z } from "zod";
import { IdSchema } from "./common.js";
import { VariableValueSchema } from "./variableValue.js";

// Downloading annotations (researcher API `GET /job/:jobId/annotations`):
// one row per unit, coder and variable, in the order they were first
// written, a page at a time. Coder-level answers (outside unit loops) come
// with the coders (`GET /job/:jobId/coders`).

/** Query of `GET /job/:jobId/annotations`. */
export const AnnotationsQuerySchema = z.object({
  /** `next` of the previous page; omit for the first page. */
  after: z.coerce.number().int().nonnegative().optional(),
  /** Rows per page (default 1000, at most 10000). */
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
  /** Also values that were replaced or reset (with `retiredAt`). Default: live values only. */
  retired: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export type AnnotationsQuery = z.input<typeof AnnotationsQuerySchema>;

export const AnnotationRowSchema = z.object({
  /** Row id: increases with every write, so pages are stable while coders keep coding. */
  id: z.number().int().positive(),
  unitId: IdSchema,
  /** The unit's external id (the researcher's own id). */
  externalId: z.string(),
  coderId: IdSchema,
  participantId: z.string().nullable(),
  variable: z.string(),
  value: VariableValueSchema,
  /** The codebook version the coder answered under. */
  codebookId: IdSchema.nullable(),
  /** Set when the coder saw other content than the unit has now (a content hash). */
  unitHash: z.string().nullable(),
  created: z.coerce.date(),
  updated: z.coerce.date(),
  /** Only with `retired=true`: when the value was replaced or reset; null if live. */
  retiredAt: z.coerce.date().nullable().optional(),
});
export type AnnotationRow = z.infer<typeof AnnotationRowSchema>;

export const AnnotationPageSchema = z.object({
  annotations: z.array(AnnotationRowSchema),
  /** Pass as `after` for the next page; null when this was the last page. */
  next: z.number().int().nonnegative().nullable(),
});
export type AnnotationPage = z.infer<typeof AnnotationPageSchema>;
