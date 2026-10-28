import { z } from "zod";
import { IdSchema } from "../common.js";
import { JobWriteSchema, JobResponseSchema, JobUsersWriteSchema, JobUserSchema } from "../job.js";
import { CodebookWriteSchema, CodebookResponseSchema, CodebookMetaSchema } from "../codebook/codebook.js";
import { UnitsCreateBodySchema, UnitMetaSchema, UnitPageSchema, UnitResponseSchema } from "../unit.js";
import { UnitFieldSchema } from "../unitFields.js";
import { UnitsetWriteSchema, UnitsetResponseSchema } from "../unitset.js";
import { CoderProgressSchema, CoderInviteWriteSchema, CoderInviteResponseSchema, CoderDeletionSchema, DeleteCodersSchema, DeleteCodersResponseSchema } from "../coder.js";
import { JobOverviewSchema } from "../overview.js";
import { ApiKeyCreatedSchema, ApiKeyResponseSchema, ApiKeyWriteSchema, AuthOptionsSchema, MeResponseSchema } from "../account.js";
import { AnnotationPageSchema, AnnotationsQuerySchema, UnitVersionPageSchema, UnitVersionsQuerySchema } from "../annotations.js";
import {
  DeploymentWriteSchema,
  DeploymentResponseSchema,
  DeploymentStatusSchema,
  ResetAnnotationsSchema,
  RefreshDeploymentSchema,
  PreviewSessionSchema,
} from "../deployment.js";

/**
 * The researcher API (docs/api/researcher.md): called by the client's
 * researcher UI (`ResearcherApi`), and by scripts (R, Python) and other
 * systems. Jobs, codebooks, units, unitsets, invitations, coder progress,
 * deployment.
 *
 * Path params are written as `:param`. A server hosts any number of jobs;
 * per-job resources are routed under `/job/:jobId/...`.
 *
 * Authentication (account.ts): a session cookie from logging in (with the
 * `x-annotinder: 1` header, against CSRF), or `authorization: Bearer <API
 * key>`. What a user may do in a job is their role there (job users).
 * Logging in itself is a browser redirect, not a JSON endpoint:
 * `GET /auth/login?returnTo=<path>`.
 */
export const researcherEndpoints = {
  getAuthOptions: { method: "GET", path: "/auth/options", request: z.void(), response: AuthOptionsSchema },
  logout: { method: "POST", path: "/auth/logout", request: z.void(), response: z.void() },
  getMe: { method: "GET", path: "/me", request: z.void(), response: MeResponseSchema },
  listApiKeys: { method: "GET", path: "/me/keys", request: z.void(), response: z.array(ApiKeyResponseSchema) },
  createApiKey: { method: "POST", path: "/me/keys", request: ApiKeyWriteSchema, response: ApiKeyCreatedSchema },
  revokeApiKey: { method: "POST", path: "/me/keys/:id/revoke", request: z.void(), response: ApiKeyResponseSchema },

  listJobs: { method: "GET", path: "/job", request: z.void(), response: z.array(JobResponseSchema) },
  createJob: { method: "POST", path: "/job", request: JobWriteSchema, response: JobResponseSchema },
  getJob: { method: "GET", path: "/job/:id", request: z.void(), response: JobResponseSchema },
  updateJob: { method: "PUT", path: "/job/:id", request: JobWriteSchema, response: JobResponseSchema },
  deleteJob: { method: "DELETE", path: "/job/:id", request: z.void(), response: z.void() },
  getJobUsers: { method: "GET", path: "/job/:id/users", request: z.void(), response: z.array(JobUserSchema) },
  putJobUsers: { method: "PUT", path: "/job/:id/users", request: JobUsersWriteSchema, response: z.void() },

  listCodebooks: {
    method: "GET",
    path: "/job/:jobId/codebook",
    request: z.void(),
    response: z.array(CodebookMetaSchema),
  },
  getCodebook: {
    method: "GET",
    path: "/job/:jobId/codebook/:id",
    request: z.void(),
    response: CodebookResponseSchema,
  },
  createCodebook: {
    method: "POST",
    path: "/job/:jobId/codebook",
    request: CodebookWriteSchema,
    response: CodebookResponseSchema,
  },
  updateCodebook: {
    method: "PUT",
    path: "/job/:jobId/codebook/:id",
    request: CodebookWriteSchema,
    response: CodebookResponseSchema,
  },
  deleteCodebook: { method: "DELETE", path: "/job/:jobId/codebook/:id", request: z.void(), response: z.void() },

  listUnits: { method: "GET", path: "/job/:jobId/units", request: z.void(), response: z.array(UnitMetaSchema) },
  /** Static paths: a server must match these before `/units/:id`. */
  getUnitFields: {
    method: "GET",
    path: "/job/:jobId/units/fields",
    request: z.void(),
    response: z.array(UnitFieldSchema),
  },
  /** Query: `offset`, `limit` (max 200), and `unitset` (that set's units, in its order). */
  listUnitPage: { method: "GET", path: "/job/:jobId/units/page", request: z.void(), response: UnitPageSchema },
  getUnit: { method: "GET", path: "/job/:jobId/units/:id", request: z.void(), response: UnitResponseSchema },
  createUnits: {
    method: "POST",
    path: "/job/:jobId/units",
    request: UnitsCreateBodySchema,
    response: z.array(UnitResponseSchema),
  },
  deleteUnit: { method: "DELETE", path: "/job/:jobId/units/:id", request: z.void(), response: z.void() },

  listUnitsets: {
    method: "GET",
    path: "/job/:jobId/unitsets",
    request: z.void(),
    response: z.array(UnitsetResponseSchema),
  },
  createUnitset: {
    method: "POST",
    path: "/job/:jobId/unitsets",
    request: UnitsetWriteSchema,
    response: UnitsetResponseSchema,
  },
  updateUnitset: {
    method: "PUT",
    path: "/job/:jobId/unitsets/:id",
    request: UnitsetWriteSchema,
    response: UnitsetResponseSchema,
  },
  deleteUnitset: { method: "DELETE", path: "/job/:jobId/unitsets/:id", request: z.void(), response: z.void() },

  listCoders: { method: "GET", path: "/job/:jobId/coders", request: z.void(), response: z.array(CoderProgressSchema) },
  /** Deletes coders and all their answers for good (e.g. a participant withdrew), by id, participant id or email (ADMIN). */
  deleteCoders: {
    method: "POST",
    path: "/job/:jobId/coders/delete",
    request: DeleteCodersSchema,
    response: DeleteCodersResponseSchema,
  },
  /** Deletes later: the coder's request to delete their answers stays, but is no longer brought up (ADMIN). */
  postponeDeletion: {
    method: "POST",
    path: "/job/:jobId/coders/:id/deletion-request/postpone",
    request: z.void(),
    response: z.void(),
  },
  /** The job's deletion log: coders whose data was deleted, newest first. */
  listCoderDeletions: {
    method: "GET",
    path: "/job/:jobId/coders/deletions",
    request: z.void(),
    response: z.array(CoderDeletionSchema),
  },
  listInvites: {
    method: "GET",
    path: "/job/:jobId/invites",
    request: z.void(),
    response: z.array(CoderInviteResponseSchema),
  },
  createInvite: {
    method: "POST",
    path: "/job/:jobId/invites",
    request: CoderInviteWriteSchema,
    response: CoderInviteResponseSchema,
  },
  revokeInvite: {
    method: "POST",
    path: "/job/:jobId/invites/:id/revoke",
    request: z.void(),
    response: CoderInviteResponseSchema,
  },
  deleteInvite: { method: "DELETE", path: "/job/:jobId/invites/:id", request: z.void(), response: z.void() },
  /** Sets the unitset of an invite (`unitsetId`, null for none). Coders already routed keep their units. */
  setInviteUnitset: {
    method: "PUT",
    path: "/job/:jobId/invites/:id/unitset",
    request: z.object({ unitsetId: IdSchema.nullable() }),
    response: CoderInviteResponseSchema,
  },
  getOverview: { method: "GET", path: "/job/:jobId/overview", request: z.void(), response: JobOverviewSchema },

  // Deploying a job: which codebook coders get (docs/architecture.md).
  getDeployment: {
    method: "GET",
    path: "/job/:jobId/deployment",
    request: z.void(),
    response: DeploymentResponseSchema.nullable(),
  },
  putDeployment: {
    method: "PUT",
    path: "/job/:jobId/deployment",
    request: DeploymentWriteSchema,
    response: DeploymentResponseSchema,
  },
  getDeploymentStatus: {
    method: "GET",
    path: "/job/:jobId/deployment/status",
    request: z.void(),
    response: DeploymentStatusSchema,
  },
  refreshDeployment: {
    method: "POST",
    path: "/job/:jobId/deployment/refresh",
    request: RefreshDeploymentSchema,
    response: z.object({ version: z.number().int().positive() }),
  },
  createPreview: {
    method: "POST",
    path: "/job/:jobId/deployment/preview",
    request: z.void(),
    response: PreviewSessionSchema,
  },
  /** Annotations, a page at a time (annotations.ts). */
  listAnnotations: {
    method: "GET",
    path: "/job/:jobId/annotations",
    query: AnnotationsQuerySchema,
    request: z.void(),
    response: AnnotationPageSchema,
  },
  /** Units as coders saw them, a page at a time (oldest first). */
  listUnitVersions: {
    method: "GET",
    path: "/job/:jobId/unit-versions",
    query: UnitVersionsQuerySchema,
    request: z.void(),
    response: UnitVersionPageSchema,
  },
  resetAnnotations: {
    method: "POST",
    path: "/job/:jobId/annotations/reset",
    request: ResetAnnotationsSchema,
    response: z.object({ retired: z.number().int().nonnegative() }),
  },
} as const;

export type ResearcherEndpointName = keyof typeof researcherEndpoints;
