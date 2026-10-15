import { z } from "zod";
import { IdSchema, UnitDataSchema } from "./common.js";
import { CodebookResponseSchema } from "./codebook/codebook.js";
import { VariableValueSchema } from "./variableValue.js";

// Contracts for the db-server <-> job-server split (see docs/architecture.md).
//
//  - db server:  source of truth for jobs, codebooks, units, coders and
//                annotations. Any language. Implements the "backend API"
//                below, which only the job server calls.
//  - job server: the annotinder runtime (packages/job-server). Coders talk
//                only to the job server; it distributes units (as described
//                by the codebook's unit_loops), validates annotations and
//                writes them through to the db server. Holds no state that
//                cannot be rebuilt from the backend API.

/** Researcher-facing: `PUT /job/:jobId/deployment` on the db server. */
export const DeploymentWriteSchema = z.object({
  codebookId: IdSchema,
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
});
export type DeploymentSpec = z.infer<typeof DeploymentSpecSchema>;

/** `GET /backend/job/:jobId/units?ids=1,2,3` -- unit content, for the job server's cache. */
export const BackendUnitSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  data: UnitDataSchema,
});
export type BackendUnit = z.infer<typeof BackendUnitSchema>;

/**
 * unit_loop name -> the unitset names (placeholders resolved) this coder was
 * routed to, in source order. Stored so routing is sticky: a coder keeps
 * their units even if later answers or a codebook update would route them
 * differently.
 */
export const CoderAssignmentsSchema = z.record(z.string(), z.array(z.string()));
export type CoderAssignments = z.infer<typeof CoderAssignmentsSchema>;

/** A coder as the job server sees it. No email or other identifying data. */
export const BackendCoderSchema = z.object({
  coderId: IdSchema,
  /** Coder-level variables, including values preset by their invitation. */
  variables: z.record(z.string(), VariableValueSchema),
  assignments: CoderAssignmentsSchema.default({}),
});
export type BackendCoder = z.infer<typeof BackendCoderSchema>;

/** `POST /backend/job/:jobId/coders/resolve` */
export const ResolveCoderRequestSchema = z.object({
  /** Client-generated, persisted coder key (dev-mode coder auth; see mock-server auth.ts). */
  coderKey: z.string().min(1),
  /**
   * Required the first time a coderKey is seen, to create the coder from an
   * invite. The db server copies the invite's preset `variables` into the
   * new coder's variables.
   */
  inviteSecret: z.string().optional(),
  /** Participant id from the URL, for invites with `participantFromUrl` (ignored otherwise). */
  participantId: z.string().min(1).max(256).optional(),
  /**
   * The coder confirmed starting a new session although their participant id
   * already has one (on another device). Without it, the db server answers
   * 409 `participant_has_session` instead of creating a second coder.
   */
  newSession: z.boolean().optional(),
});
export type ResolveCoderRequest = z.infer<typeof ResolveCoderRequestSchema>;

/** `PUT /backend/job/:jobId/coders/:coderId` -- full replace of the job-server-managed coder state. */
export const BackendCoderWriteSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
  assignments: CoderAssignmentsSchema,
});
export type BackendCoderWrite = z.infer<typeof BackendCoderWriteSchema>;

/**
 * `GET /backend/job/:jobId/annotations?coderId=X` -- one coder's variables for
 * one unit, as stored by the db server. Includes unfinished annotations.
 */
export const BackendAnnotationSchema = z.object({
  unitId: IdSchema,
  coderId: IdSchema,
  variables: z.record(z.string(), VariableValueSchema),
  /** As last written by the job server (see `BackendAnnotationWriteSchema.done`). */
  done: z.boolean(),
  /** Server timestamp of the last write. */
  updated: z.coerce.date(),
  /** The codebook the annotation was last written under (absent for old annotations). */
  codebookId: IdSchema.nullish(),
});
export type BackendAnnotation = z.infer<typeof BackendAnnotationSchema>;

/**
 * `GET /backend/job/:jobId/codings?variables=a,b` -- the finished annotations
 * (`done`) of all coders, ordered by `doneAt`. This is what the job server
 * needs for distribution, so it can be loaded for a whole job cheaply:
 * `values` holds only the requested variables (a plain key projection of
 * `variables`; the job server asks for the agreement variables of dynamic
 * sources, often none).
 */
export const BackendCodingSchema = z.object({
  unitId: IdSchema,
  coderId: IdSchema,
  /** When the annotation was first written as done. Set once; resubmitting doesn't change it. */
  doneAt: z.coerce.date(),
  values: z.record(z.string(), VariableValueSchema).optional(),
});
export type BackendCoding = z.infer<typeof BackendCodingSchema>;

/** `PUT /backend/job/:jobId/annotations/:unitId/:coderId` -- write-through from the job server. */
export const BackendAnnotationWriteSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
  /**
   * Whether the coder finished the unit, decided by the job server at submit
   * time (docs/architecture.md §8.2). The db server stores it as is, and sets
   * `doneAt` the first time it is true.
   */
  done: z.boolean(),
  /** The deployed codebook the coder answered under, so researchers can tell versions apart. */
  codebookId: IdSchema.optional(),
});
export type BackendAnnotationWrite = z.infer<typeof BackendAnnotationWriteSchema>;

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
  listCoders: {
    method: "GET",
    path: "/backend/job/:jobId/coders",
    request: z.void(),
    response: z.array(BackendCoderSchema),
  },
  resolveCoder: {
    method: "POST",
    path: "/backend/job/:jobId/coders/resolve",
    request: ResolveCoderRequestSchema,
    response: BackendCoderSchema,
  },
  putCoder: {
    method: "PUT",
    path: "/backend/job/:jobId/coders/:coderId",
    request: BackendCoderWriteSchema,
    response: z.void(),
  },
  listCodings: {
    method: "GET",
    path: "/backend/job/:jobId/codings",
    request: z.void(),
    response: z.array(BackendCodingSchema),
  },
  listAnnotations: {
    method: "GET",
    path: "/backend/job/:jobId/annotations",
    request: z.void(),
    response: z.array(BackendAnnotationSchema),
  },
  putAnnotation: {
    method: "PUT",
    path: "/backend/job/:jobId/annotations/:unitId/:coderId",
    request: BackendAnnotationWriteSchema,
    response: z.void(),
  },
} as const;

// ---------------------------------------------------------------------------
// Job server admin API: called by the db server (same shared secret).
// Deployment ids are `<backend name>.<jobId>`, where the backend name is how
// the job server's config refers to that db server.
// ---------------------------------------------------------------------------

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
