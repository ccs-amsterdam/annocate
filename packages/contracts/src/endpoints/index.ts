import { z } from "zod";
import { JobWriteSchema, JobResponseSchema, JobUsersWriteSchema, JobUserSchema } from "../job.js";
import { CodebookWriteSchema, CodebookResponseSchema, CodebookMetaSchema } from "../codebook/codebook.js";
import { UnitsCreateBodySchema, UnitMetaSchema, UnitResponseSchema, CoderUnitResponseSchema } from "../unit.js";
import { UnitsetWriteSchema, UnitsetResponseSchema, GenerateUnitsetsSchema } from "../unitset.js";
import { PostUnitVariablesSchema, PostCoderVariablesSchema } from "../variableValue.js";
import {
  SessionResponseSchema,
  TransferResponseSchema,
  RedeemTransferSchema,
  RedeemTransferResponseSchema,
} from "../session.js";
import { CoderProgressSchema, CoderInviteWriteSchema, CoderInviteResponseSchema } from "../coder.js";
import {
  DeploymentWriteSchema,
  DeploymentResponseSchema,
  DeploymentStatusSchema,
  ResetAnnotationsSchema,
} from "../deployment.js";

/**
 * The full API contract (CONTRACTS.md), as a registry of
 * { method, path, request schema, response schema } entries.
 *
 * Path params are written as `:param`. A server hosts any number of jobs
 * (CONTRACTS.md); all per-job resources (codebooks, units, unitsets,
 * coders) are routed under `/job/:jobId/...`. Only the coder-facing,
 * annotation-time endpoints (session/unit-fetch/variable-submit) are
 * unscoped in the URL -- a coder is already tied to exactly one job via
 * their invite/coder-key, so the server resolves jobId from that instead.
 *
 * This registry is the single source of truth consumed by:
 *  - the mock server (packages/mock-server), for request validation
 *  - `generate:json-schema` (scripts/generateJsonSchema.ts), for a
 *    language-agnostic spec non-TS server authors can implement against
 */
export const endpoints = {
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
  generateUnitsets: {
    method: "POST",
    path: "/job/:jobId/unitsets/generate",
    request: GenerateUnitsetsSchema,
    response: z.array(UnitsetResponseSchema),
  },

  getSession: { method: "GET", path: "/session", request: z.void(), response: SessionResponseSchema },
  getNextUnit: {
    method: "GET",
    path: "/loop/:loop/next",
    request: z.void(),
    response: CoderUnitResponseSchema.nullable(),
  },
  /** A unit the coder already has in this loop (finished or in progress), e.g. to go back to it after resuming. */
  getLoopUnit: {
    method: "GET",
    path: "/loop/:loop/units/:unitId",
    request: z.void(),
    response: CoderUnitResponseSchema,
  },
  postUnitVariables: { method: "POST", path: "/variables/unit", request: PostUnitVariablesSchema, response: z.void() },
  postCoderVariables: {
    method: "POST",
    path: "/variables/coder",
    request: PostCoderVariablesSchema,
    response: z.void(),
  },
  createTransfer: { method: "POST", path: "/transfer", request: z.void(), response: TransferResponseSchema },
  redeemTransfer: {
    method: "POST",
    path: "/transfer/redeem",
    request: RedeemTransferSchema,
    response: RedeemTransferResponseSchema,
  },

  listCoders: { method: "GET", path: "/job/:jobId/coders", request: z.void(), response: z.array(CoderProgressSchema) },
  inviteCoder: {
    method: "POST",
    path: "/job/:jobId/coders/invite",
    request: CoderInviteWriteSchema,
    response: CoderInviteResponseSchema,
  },

  // Deploying a job to a job server (docs/architecture.md). The db server
  // stores the deployment and notifies the job server; status is proxied
  // from the job server.
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
  resetAnnotations: {
    method: "POST",
    path: "/job/:jobId/annotations/reset",
    request: ResetAnnotationsSchema,
    response: z.object({ retired: z.number().int().nonnegative() }),
  },
} as const;

export type EndpointName = keyof typeof endpoints;
export type EndpointDef = (typeof endpoints)[EndpointName];
