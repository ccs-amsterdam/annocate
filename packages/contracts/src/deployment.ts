import { z } from "zod";
import { IdSchema } from "./common.js";

// Deploying a job (researcher API): which codebook coders get, its status,
// and previews. The coder side is the coder API (endpoints/coder.ts).

/** Researcher-facing: `PUT /job/:jobId/deployment`. */
export const DeploymentWriteSchema = z.object({
  codebookId: IdSchema,
  /** Set to false to stop handing out units (coders get a 409). */
  active: z.boolean().default(true),
});
export type DeploymentWrite = z.infer<typeof DeploymentWriteSchema>;

export const DeploymentResponseSchema = DeploymentWriteSchema.extend({
  jobId: IdSchema,
  /** Bumped on every change. */
  version: z.number().int().positive(),
  updated: z.coerce.date(),
  /**
   * Things the researcher should know about this deploy, e.g. that a loop
   * gained questions, which reopens units coders already finished.
   */
  warnings: z.array(z.string()).optional(),
});
export type DeploymentResponse = z.infer<typeof DeploymentResponseSchema>;

/**
 * Researcher-facing: `POST /job/:jobId/annotations/reset`. Retires the live
 * values of these variables (e.g. all questions of a loop), optionally only
 * for some units or coders. Nothing is deleted: retired values stay for
 * analysis, and the units count as unfinished again.
 */
export const ResetAnnotationsSchema = z.object({
  variables: z.array(z.string()).min(1),
  unitIds: z.array(IdSchema).optional(),
  coderIds: z.array(IdSchema).optional(),
});
export type ResetAnnotations = z.infer<typeof ResetAnnotationsSchema>;

/** Progress of one source (unitset) of one unit_loop. */
export const SourceStatusSchema = z.object({
  loop: z.string(),
  unitset: z.string(),
  mode: z.enum(["fixed", "dynamic"]),
  totalUnits: z.number().int().nonnegative(),
  /** Dynamic: units that met their saturation rule. Fixed: units every routed coder finished. */
  completeUnits: z.number().int().nonnegative(),
  /** Units with at least one coding. */
  startedUnits: z.number().int().nonnegative(),
  /** Dynamic: units currently reserved for a coder. */
  leasedUnits: z.number().int().nonnegative(),
  codings: z.number().int().nonnegative(),
  /** Coders routed to this source. */
  coders: z.number().int().nonnegative(),
});

export const DeploymentStatusSchema = z.object({
  deploymentId: z.string(),
  version: z.number().int().positive(),
  active: z.boolean(),
  coders: z.number().int().nonnegative(),
  sources: z.array(SourceStatusSchema),
  loadedAt: z.coerce.date(),
  /** What the server holds in memory for this deployment: coders' answers (sizes estimated from JSON). */
  memory: z
    .object({
      coders: z.number().int().nonnegative(),
      coderBytes: z.number().int().nonnegative(),
    })
    .optional(),
});
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

/**
 * Researcher `POST /job/:jobId/deployment/preview`: a preview of the job's
 * latest codebook (deployed or not), run as deployment `<jobId>.preview`.
 * Coders and answers stay in the server's memory; nothing is stored. The
 * client uses `token` like an invite secret (`x-invite-secret`).
 */
export const PreviewSessionSchema = z.object({
  deploymentId: z.string(),
  token: z.string(),
  expiresAt: z.coerce.date(),
});
export type PreviewSession = z.infer<typeof PreviewSessionSchema>;

