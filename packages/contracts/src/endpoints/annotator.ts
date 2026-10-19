import { z } from "zod";
import {
  AnnotatorAnnotationBatchResultSchema,
  AnnotatorAnnotationBatchSchema,
  AnnotatorAnnotationSchema,
  AnnotatorCoderSchema,
  AnnotatorCoderWriteSchema,
  AnnotatorFinishedSchema,
  AnnotatorUnitSchema,
  DeploymentSpecSchema,
  FinishedRequestSchema,
  JobTokenRequestSchema,
  JobTokenResponseSchema,
  ResolveCoderRequestSchema,
} from "../deployment.js";

/**
 * The annotator API (docs/api/annotator.md): served by a db server, called
 * only by the job server, which needs it to run the annotator. Plain data
 * access: the deployment spec, unit content, coders, finished codings, a
 * coder's own answers and batched writes. Authenticated with a job token
 * (`authorization: Bearer <token>`) from `requestJobToken`.
 */
export const annotatorEndpoints = {
  requestJobToken: {
    method: "POST",
    path: "/annotator/job/:jobId/token",
    request: JobTokenRequestSchema,
    response: JobTokenResponseSchema,
  },
  getDeployment: {
    method: "GET",
    path: "/annotator/job/:jobId/deployment",
    request: z.void(),
    response: DeploymentSpecSchema,
  },
  getUnits: {
    method: "GET",
    path: "/annotator/job/:jobId/units",
    request: z.void(),
    response: z.array(AnnotatorUnitSchema),
  },
  listCoders: {
    method: "GET",
    path: "/annotator/job/:jobId/coders",
    request: z.void(),
    response: z.array(AnnotatorCoderSchema),
  },
  resolveCoder: {
    method: "POST",
    path: "/annotator/job/:jobId/coders/resolve",
    request: ResolveCoderRequestSchema,
    response: AnnotatorCoderSchema,
  },
  putCoder: {
    method: "PUT",
    path: "/annotator/job/:jobId/coders/:coderId",
    request: AnnotatorCoderWriteSchema,
    response: z.void(),
  },
  listFinished: {
    method: "POST",
    path: "/annotator/job/:jobId/finished",
    request: FinishedRequestSchema,
    response: z.array(AnnotatorFinishedSchema),
  },
  listAnnotations: {
    method: "GET",
    path: "/annotator/job/:jobId/annotations",
    request: z.void(),
    response: z.array(AnnotatorAnnotationSchema),
  },
  putAnnotations: {
    method: "POST",
    path: "/annotator/job/:jobId/annotations",
    request: AnnotatorAnnotationBatchSchema,
    response: AnnotatorAnnotationBatchResultSchema,
  },
} as const;

export type AnnotatorEndpointName = keyof typeof annotatorEndpoints;
