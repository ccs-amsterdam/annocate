import { z } from "zod";
import { IdSchema } from "./common.js";

// Deploying a job (researcher API): which codebook coders get, its status,
// and previews. The coder side is the coder API (endpoints/coder.ts).
// Everything is a draft until deployed (docs/plans/design.md §5): a
// deployed version is a codebook with a snapshot of the units and sets.

/** The draft's units compared with the deployed ones. */
export const UnitChangesSchema = z.object({
  added: z.number().int().nonnegative(),
  /** Units with other content (a new version). */
  changed: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  /** The sets differ. */
  sets: z.boolean(),
});
export type UnitChanges = z.infer<typeof UnitChangesSchema>;

/** What a deployed version changed: the codebook, and the units (null: kept). */
export const DeploymentChangesSchema = z.object({
  codebook: z.boolean(),
  units: UnitChangesSchema.nullable(),
});
export type DeploymentChanges = z.infer<typeof DeploymentChangesSchema>;

/** `GET /job/:jobId/deployment/versions`: the deployed versions, newest first. */
export const DeploymentVersionSchema = z.object({
  version: z.number().int().positive(),
  codebookId: IdSchema,
  changes: DeploymentChangesSchema,
  created: z.coerce.date(),
});
export type DeploymentVersion = z.infer<typeof DeploymentVersionSchema>;

/** `GET /job/:jobId/deployment/pending`: what deploying the drafts would change. */
export const PendingChangesSchema = z.object({
  /** The draft units against the deployed ones (all added when nothing is deployed). */
  units: UnitChangesSchema,
  /** The latest codebook, if it isn't the deployed one. */
  codebookId: IdSchema.nullable(),
});
export type PendingChanges = z.infer<typeof PendingChangesSchema>;

/** Researcher-facing: `PUT /job/:jobId/deployment`. */
export const DeploymentWriteSchema = z.object({
  /** The codebook coders get (the deployed one: keep it). */
  codebookId: IdSchema,
  /**
   * Deploy the draft units and sets too. Default false: keep the deployed
   * ones, so changing the codebook or pausing deploys no units by accident
   * (the first deploy always takes the draft's).
   */
  units: z.boolean().default(false),
  /** Set to false to stop handing out units (coders get a 409). */
  active: z.boolean().default(true),
  /**
   * The researcher confirmed deploying although it makes more than
   * `CONFIRM_LINKS` links (409 `confirm_links` otherwise). At most `MAX_LINKS`.
   */
  confirmLinks: z.boolean().optional(),
});
export type DeploymentWrite = z.infer<typeof DeploymentWriteSchema>;

export const DeploymentResponseSchema = DeploymentWriteSchema.omit({ units: true }).extend({
  jobId: IdSchema,
  /** Bumped on every change. */
  version: z.number().int().positive(),
  updated: z.coerce.date(),
  /**
   * Things the researcher should know about this deploy, e.g. that a loop
   * gained questions, which reopens units coders already finished.
   */
  warnings: z.array(z.string()).optional(),
  /** How many active links the codebook's link parameters make. */
  links: z.number().int().nonnegative().optional(),
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

/** Progress of one source (a set, as `group/set`, or `__all__`) of one unit_loop. */
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

