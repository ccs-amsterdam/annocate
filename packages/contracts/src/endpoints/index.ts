import { z } from "zod";
import { JobWriteSchema, JobResponseSchema, JobUsersWriteSchema, JobUserSchema } from "../job";
import { CodebookWriteSchema, CodebookResponseSchema, CodebookMetaSchema } from "../codebook/codebook";
import { UnitsCreateBodySchema, UnitMetaSchema, UnitResponseSchema, CoderUnitResponseSchema } from "../unit";
import { UnitsetWriteSchema, UnitsetResponseSchema } from "../unitset";
import { PostUnitVariablesSchema, PostCoderVariablesSchema } from "../variableValue";
import { SessionResponseSchema } from "../session";
import { CoderProgressSchema, CoderInviteWriteSchema, CoderInviteResponseSchema } from "../coder";

/**
 * The full API contract (design plan §3), as a registry of
 * { method, path, request schema, response schema } entries.
 *
 * Path params are written as `:param`. All endpoints are implicitly scoped
 * under a job -- a server may expose one job per deployment, or route by
 * jobId; the client should not assume which (see design plan §3).
 *
 * This registry is the single source of truth consumed by:
 *  - the mock server (packages/mock-server), for request validation
 *  - `generate:json-schema` (scripts/generateJsonSchema.ts), for a
 *    language-agnostic spec non-TS server authors can implement against
 */
export const endpoints = {
  createJob: { method: "POST", path: "/job", request: JobWriteSchema, response: JobResponseSchema },
  getJob: { method: "GET", path: "/job/:id", request: z.void(), response: JobResponseSchema },
  updateJob: { method: "PUT", path: "/job/:id", request: JobWriteSchema, response: JobResponseSchema },
  deleteJob: { method: "DELETE", path: "/job/:id", request: z.void(), response: z.void() },
  getJobUsers: { method: "GET", path: "/job/:id/users", request: z.void(), response: z.array(JobUserSchema) },
  putJobUsers: { method: "PUT", path: "/job/:id/users", request: JobUsersWriteSchema, response: z.void() },

  listCodebooks: { method: "GET", path: "/codebook", request: z.void(), response: z.array(CodebookMetaSchema) },
  getCodebook: { method: "GET", path: "/codebook/:id", request: z.void(), response: CodebookResponseSchema },
  createCodebook: { method: "POST", path: "/codebook", request: CodebookWriteSchema, response: CodebookResponseSchema },
  updateCodebook: {
    method: "PUT",
    path: "/codebook/:id",
    request: CodebookWriteSchema,
    response: CodebookResponseSchema,
  },
  deleteCodebook: { method: "DELETE", path: "/codebook/:id", request: z.void(), response: z.void() },

  listUnits: { method: "GET", path: "/units", request: z.void(), response: z.array(UnitMetaSchema) },
  getUnit: { method: "GET", path: "/units/:id", request: z.void(), response: UnitResponseSchema },
  createUnits: { method: "POST", path: "/units", request: UnitsCreateBodySchema, response: z.array(UnitResponseSchema) },
  deleteUnit: { method: "DELETE", path: "/units/:id", request: z.void(), response: z.void() },

  listUnitsets: { method: "GET", path: "/unitsets", request: z.void(), response: z.array(UnitsetResponseSchema) },
  createUnitset: { method: "POST", path: "/unitsets", request: UnitsetWriteSchema, response: UnitsetResponseSchema },
  updateUnitset: {
    method: "PUT",
    path: "/unitsets/:id",
    request: UnitsetWriteSchema,
    response: UnitsetResponseSchema,
  },
  deleteUnitset: { method: "DELETE", path: "/unitsets/:id", request: z.void(), response: z.void() },

  getSession: { method: "GET", path: "/session", request: z.void(), response: SessionResponseSchema },
  getNextUnit: {
    method: "GET",
    path: "/unitset/:setname/next",
    request: z.void(),
    response: CoderUnitResponseSchema.nullable(),
  },
  postUnitVariables: { method: "POST", path: "/variables/unit", request: PostUnitVariablesSchema, response: z.void() },
  postCoderVariables: {
    method: "POST",
    path: "/variables/coder",
    request: PostCoderVariablesSchema,
    response: z.void(),
  },

  listCoders: { method: "GET", path: "/coders", request: z.void(), response: z.array(CoderProgressSchema) },
  inviteCoder: { method: "POST", path: "/coders/invite", request: CoderInviteWriteSchema, response: CoderInviteResponseSchema },
} as const;

export type EndpointName = keyof typeof endpoints;
export type EndpointDef = (typeof endpoints)[EndpointName];
