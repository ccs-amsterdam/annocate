import { z } from "zod";
import { IdSchema, SafeNameSchema, UnitDataSchema } from "./common.js";
import { CodebookResponseSchema } from "./codebook/codebook.js";
import { VariableValueSchema } from "./variableValue.js";

// Contracts for the db-server <-> job-server split (see docs/architecture.md).
//
//  - db server:  source of truth for jobs, codebooks, units, coders and
//                annotations. Any language. Implements the "backend API"
//                below, which only the job server calls.
//  - job server: the annotinder runtime (packages/job-server). Coders talk
//                only to the job server; it distributes units, validates
//                annotations and writes them through to the db server. Holds
//                no state that cannot be rebuilt from the backend API.

/** Unitset name used for unit loops without an explicit unitset (= all units in the job). */
export const ALL_UNITS_UNITSET = "__all__";

/**
 * How units of one unitset are distributed over coders.
 *
 * - `per_coder`: every coder codes every unit (optionally capped), in the
 *   unitset order (or a per-coder shuffle if the unit_loop has
 *   `randomizeUnits`). No coordination between coders needed.
 * - `crowd`: units come from a shared queue. A unit is complete once at
 *   least `codersPerUnit` coders finished it and, if `agreement` is set,
 *   `agreement.minAgree` of them gave the same value for
 *   `agreement.variable` -- or, regardless, once `agreement.maxCoders`
 *   coders finished it. Units are leased to a coder for `leaseSeconds`, so
 *   abandoned units return to the queue.
 */
export const PerCoderDistributionSchema = z.object({
  mode: z.literal("per_coder"),
  maxUnitsPerCoder: z.number().int().positive().optional(),
});

export const AgreementRuleSchema = z
  .object({
    /** A unit_variable in this unitset's unit_loop; its value is compared across coders. */
    variable: SafeNameSchema,
    minAgree: z.number().int().min(1),
    /** Stop handing out the unit once this many coders finished it, even without agreement. */
    maxCoders: z.number().int().min(1),
  })
  .refine((a) => a.maxCoders >= a.minAgree, { message: "maxCoders must be >= minAgree" });
export type AgreementRule = z.infer<typeof AgreementRuleSchema>;

export const CrowdDistributionSchema = z.object({
  mode: z.literal("crowd"),
  codersPerUnit: z.number().int().min(1).default(1),
  agreement: AgreementRuleSchema.optional(),
  maxUnitsPerCoder: z.number().int().positive().optional(),
  leaseSeconds: z.number().int().positive().default(900),
  /**
   * `fill`: prefer units that are closest to completion (finished units fast).
   * `spread`: prefer units with the fewest codings (even coverage first).
   */
  strategy: z.enum(["fill", "spread"]).default("fill"),
});

export const DistributionRuleSchema = z.discriminatedUnion("mode", [
  PerCoderDistributionSchema,
  CrowdDistributionSchema,
]);
export type DistributionRule = z.infer<typeof DistributionRuleSchema>;

/** Researcher-facing: `PUT /job/:jobId/deployment` on the db server. */
export const DeploymentWriteSchema = z.object({
  codebookId: IdSchema,
  /** unitset name -> rule. Unitsets without a rule default to `{ mode: "per_coder" }`. */
  distribution: z.record(z.string(), DistributionRuleSchema).default({}),
  /** Set to false to stop the job server from handing out units (coders get a 409). */
  active: z.boolean().default(true),
});
export type DeploymentWrite = z.infer<typeof DeploymentWriteSchema>;

export const DeploymentResponseSchema = DeploymentWriteSchema.extend({
  jobId: IdSchema,
  /** Bumped on every change, so the job server can detect a stale cached spec. */
  version: z.number().int().positive(),
  updated: z.coerce.date(),
});
export type DeploymentResponse = z.infer<typeof DeploymentResponseSchema>;

// ---------------------------------------------------------------------------
// Backend API: implemented by the db server, called only by the job server.
// Authenticated with `authorization: Bearer <shared secret>`.
// ---------------------------------------------------------------------------

/** `GET /backend/job/:jobId/deployment` -- everything the job server needs to run the job, minus unit content. */
export const DeploymentSpecSchema = z.object({
  jobId: IdSchema,
  version: z.number().int().positive(),
  active: z.boolean(),
  codebook: CodebookResponseSchema,
  /** All unitsets of the job, plus `__all__` (every unit id in the job). */
  unitsets: z.array(z.object({ name: z.string(), unitIds: z.array(IdSchema) })),
  distribution: z.record(z.string(), DistributionRuleSchema),
});
export type DeploymentSpec = z.infer<typeof DeploymentSpecSchema>;

/** `GET /backend/job/:jobId/units?ids=1,2,3` -- unit content, for the job server's cache. */
export const BackendUnitSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  data: UnitDataSchema,
});
export type BackendUnit = z.infer<typeof BackendUnitSchema>;

/** `POST /backend/job/:jobId/coders/resolve` */
export const ResolveCoderRequestSchema = z.object({
  /** Client-generated, persisted coder key (dev-mode coder auth; see mock-server auth.ts). */
  coderKey: z.string().min(1),
  /** Required the first time a coderKey is seen, to create the coder from an invite. */
  inviteSecret: z.string().optional(),
});
export type ResolveCoderRequest = z.infer<typeof ResolveCoderRequestSchema>;

export const ResolveCoderResponseSchema = z.object({
  coderId: IdSchema,
  variables: z.record(z.string(), VariableValueSchema),
});
export type ResolveCoderResponse = z.infer<typeof ResolveCoderResponseSchema>;

/** One coder's variables for one unit, as stored by the db server. */
export const BackendAnnotationSchema = z.object({
  unitId: IdSchema,
  coderId: IdSchema,
  variables: z.record(z.string(), VariableValueSchema),
  /** Server timestamp of the last write; the job server uses it to order a coder's progress. */
  updated: z.coerce.date(),
});
export type BackendAnnotation = z.infer<typeof BackendAnnotationSchema>;

/** `GET /backend/job/:jobId/annotations` -- used to rebuild job-server state. */
export const BackendAnnotationsResponseSchema = z.array(BackendAnnotationSchema);

/** `PUT /backend/job/:jobId/annotations/:unitId/:coderId` -- write-through from the job server. */
export const BackendAnnotationWriteSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
});

/** `PUT /backend/job/:jobId/coders/:coderId/variables` -- coder-level (non-unit) variables. */
export const BackendCoderVariablesWriteSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
});

export const backendEndpoints = {
  getDeployment: {
    method: "GET",
    path: "/backend/job/:jobId/deployment",
    request: z.void(),
    response: DeploymentSpecSchema,
  },
  getUnits: {
    method: "GET",
    path: "/backend/job/:jobId/units",
    request: z.void(),
    response: z.array(BackendUnitSchema),
  },
  resolveCoder: {
    method: "POST",
    path: "/backend/job/:jobId/coders/resolve",
    request: ResolveCoderRequestSchema,
    response: ResolveCoderResponseSchema,
  },
  listAnnotations: {
    method: "GET",
    path: "/backend/job/:jobId/annotations",
    request: z.void(),
    response: BackendAnnotationsResponseSchema,
  },
  putAnnotation: {
    method: "PUT",
    path: "/backend/job/:jobId/annotations/:unitId/:coderId",
    request: BackendAnnotationWriteSchema,
    response: z.void(),
  },
  putCoderVariables: {
    method: "PUT",
    path: "/backend/job/:jobId/coders/:coderId/variables",
    request: BackendCoderVariablesWriteSchema,
    response: z.void(),
  },
} as const;

// ---------------------------------------------------------------------------
// Job server admin API: called by the db server (same shared secret).
// Deployment ids are `<backend name>.<jobId>`, where the backend name is how
// the job server's config refers to that db server.
// ---------------------------------------------------------------------------

export const UnitsetStatusSchema = z.object({
  unitset: z.string(),
  mode: z.enum(["per_coder", "crowd"]),
  totalUnits: z.number().int().nonnegative(),
  /** Crowd mode: units that met their completion rule. Per-coder mode: units every active coder finished. */
  completeUnits: z.number().int().nonnegative(),
  /** Units with at least one coding. */
  startedUnits: z.number().int().nonnegative(),
  /** Crowd mode: currently leased (being coded) units. */
  leasedUnits: z.number().int().nonnegative(),
  codings: z.number().int().nonnegative(),
});

export const DeploymentStatusSchema = z.object({
  deploymentId: z.string(),
  version: z.number().int().positive(),
  active: z.boolean(),
  coders: z.number().int().nonnegative(),
  unitsets: z.array(UnitsetStatusSchema),
  loadedAt: z.coerce.date(),
});
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const jobServerAdminEndpoints = {
  refreshDeployment: {
    method: "POST",
    path: "/admin/deployments/:deploymentId/refresh",
    request: z.void(),
    response: DeploymentStatusSchema,
  },
  getDeploymentStatus: {
    method: "GET",
    path: "/admin/deployments/:deploymentId/status",
    request: z.void(),
    response: DeploymentStatusSchema,
  },
  dropDeployment: {
    method: "DELETE",
    path: "/admin/deployments/:deploymentId",
    request: z.void(),
    response: z.void(),
  },
} as const;
