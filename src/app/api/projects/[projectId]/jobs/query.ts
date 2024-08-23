import {
  JobBlockCreateSchema,
  JobBlockResponseSchema,
  JobBlockUpdateSchema,
  JobCreateSchema,
  JobResponseSchema,
  JobMetaResponseSchema,
  JobsTableParamsSchema,
  JobUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/schemas";
import { z } from "zod";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { useDelete, useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { projects } from "@/drizzle/schema";

export function useJobs(projectId: number, initialParams?: z.input<typeof JobsTableParamsSchema>) {
  return useTableGet({
    endpoint: `projects/${projectId}/jobs`,
    initialParams: initialParams || {},
    responseSchema: JobMetaResponseSchema,
  });
}

export function useCreateJob(projectId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs`,
    bodySchema: JobCreateSchema,
    responseSchema: IdResponseSchema,
  });
}

export function useJob(projectId: number, jobId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}`,
    responseSchema: JobResponseSchema,
    disabled: !jobId,
  });
}

export function useUpdateJob(projectId: number, jobId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}`,
    bodySchema: JobUpdateSchema,
    responseSchema: JobMetaResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs`],
  });
}

export function useCreateJobBlock(projectId: number, jobId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}`, `projects/${projectId}/codebooks`],
  });
}
export function useUpdateJobBlock(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlockUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [
      `projects/${projectId}/jobs`,
      `projects/${projectId}/jobs/${jobId}`,
      `projects/${projectId}/codebooks`,
    ],
  });
}

export function useDeleteJobBlock(projectId: number, jobId: number, blockId: number) {
  return useDelete({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}`, `projects/${projectId}/codebooks`],
  });
}

export function useJobBlock(projectId: number, jobId?: number, blockId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    responseSchema: JobBlockResponseSchema,
    disabled: !blockId || !jobId,
  });
}

export const openapiJobs = createOpenAPIDefinitions(
  ["Job management"],
  [
    {
      path: "/jobs",
      method: "get",
      description: "Get all jobs",
      params: JobsTableParamsSchema,
      response: JobMetaResponseSchema,
    },
    {
      path: "/jobs",
      method: "post",
      description: "Create a job",
      body: JobUpdateSchema,
      response: JobMetaResponseSchema,
    },
    {
      path: "/jobs/{jobId}",
      method: "post",
      description: "Update a job",
      body: JobUpdateSchema,
      response: JobMetaResponseSchema,
    },
    {
      path: "/jobs/{jobId}",
      method: "get",
      description: "Get a job, including a list of its units",
      response: JobResponseSchema,
    },
    { path: "/jobs/{jobId}/blocks", method: "post", description: "Create a block", body: JobBlockCreateSchema },
    {
      path: "/jobs/{jobId}/blocks/{blockId}",
      method: "post",
      description: "Update a block",
      body: JobBlockUpdateSchema,
    },
    { path: "/jobs/{jobId}/blocks/{blockId}", method: "delete", description: "Delete a block" },
    { path: "/jobs/{jobId}/blocks/{blockId}/units", method: "get", description: "Get a list of units for a block" },
  ],
);
