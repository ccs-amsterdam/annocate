import { z } from "zod";
import { IdSchema, UnitDataSchema } from "./common.js";
import { AnswerTimingSchema, VariableValueSchema } from "./variableValue.js";

// Downloading annotations (researcher API `GET /job/:jobId/annotations`):
// one row per answer: unit (or none, for answers outside unit loops and
// values the server assigned), coder and variable, in the order they were
// first written, a page at a time. Coder-level values also come with the
// coders (`GET /job/:jobId/coders`, `variables`).

/** Query of `GET /job/:jobId/annotations`. */
export const AnnotationsQuerySchema = z.object({
  /** `next` of the previous page; omit for the first page. */
  after: z.coerce.number().int().nonnegative().optional(),
  /** Rows per page (default 1000, at most 10000). */
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
  /** Also values a researcher reset (with `retiredAt`). Default: live values only. */
  retired: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export type AnnotationsQuery = z.input<typeof AnnotationsQuerySchema>;

export const AnnotationRowSchema = z.object({
  /** Row id: in the order rows were first written, so new answers come after pages already read (a changed answer keeps its row: see `updated`). */
  id: z.number().int().positive(),
  /** Null for answers outside unit loops (survey questions) and assigned values. */
  unitId: IdSchema.nullable(),
  /** The unit's external id (the researcher's own id); null without a unit. */
  externalId: z.string().nullable(),
  coderId: IdSchema,
  participantId: z.string().nullable(),
  variable: z.string(),
  value: VariableValueSchema,
  /** The codebook version the coder answered under. */
  codebookId: IdSchema.nullable(),
  /** The unit as the coder saw it (`listUnitVersions`); null for answers from before versions were kept. */
  unitVersionId: IdSchema.nullable(),
  /** The device the answer was (last) given on (`listDevices`); null in previews and for devices that were deleted. */
  deviceId: IdSchema.nullable(),
  /** Set by the server, not answered: an invite preset, a random or balanced group, a URL parameter (`auto` questions). */
  assigned: z.boolean(),
  /** How long the coder took on the question, as their browser measured it; null for assigned values and previews. */
  timing: AnswerTimingSchema.nullable(),
  /** Unit answers: when the server first handed the unit to this coder (the server's own bound on their time); null otherwise. */
  servedAt: z.coerce.date().nullable(),
  created: z.coerce.date(),
  updated: z.coerce.date(),
  /** Only with `retired=true`: when the value was reset; null if live. */
  retiredAt: z.coerce.date().nullable().optional(),
});
export type AnnotationRow = z.infer<typeof AnnotationRowSchema>;

export const AnnotationPageSchema = z.object({
  annotations: z.array(AnnotationRowSchema),
  /** Pass as `after` for the next page; null when this was the last page. */
  next: z.number().int().nonnegative().nullable(),
});
export type AnnotationPage = z.infer<typeof AnnotationPageSchema>;

/**
 * A unit as coders saw it (docs/architecture.md §8.4): its external id and
 * the fields the codebook showed (`shownUnitFields`), kept once per version.
 * A unit replaced after it was coded has several; every answer points to
 * the one its coder saw (`unitVersionId`).
 */
export const UnitVersionSchema = z.object({
  id: IdSchema,
  unitId: IdSchema,
  externalId: z.string(),
  /** Of the external id and `data`. */
  hash: z.string(),
  data: UnitDataSchema,
  /** When it was first shown. */
  created: z.coerce.date(),
});
export type UnitVersion = z.infer<typeof UnitVersionSchema>;

/** Query of `GET /job/:jobId/unit-versions`: pages, like annotations. */
export const UnitVersionsQuerySchema = z.object({
  after: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});
export type UnitVersionsQuery = z.input<typeof UnitVersionsQuerySchema>;

export const UnitVersionPageSchema = z.object({
  versions: z.array(UnitVersionSchema),
  /** Pass as `after` for the next page; null when this was the last page. */
  next: z.number().int().nonnegative().nullable(),
});
export type UnitVersionPage = z.infer<typeof UnitVersionPageSchema>;

/**
 * A device a coder used (`GET /job/:jobId/devices`): coarse details from the
 * browser (docs/coder-identity.md §4), when it joined the session. A session
 * has several when the coder continued on another device.
 */
export const DeviceSchema = z.object({
  id: IdSchema,
  coderId: IdSchema,
  type: z.enum(["phone", "tablet", "desktop"]).nullable(),
  browser: z.string().nullable(),
  os: z.string().nullable(),
  created: z.coerce.date(),
});
export type Device = z.infer<typeof DeviceSchema>;
