import {
  JobBlockCreateSchema,
  JobBlockUpdateSchema,
  JobCreateSchema,
  JobResponseSchema,
  JobsResponseSchema,
  JobsTableParamsSchema,
  JobUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/schemas";
import { z } from "zod";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";

export function useJobs(projectId: number, initialParams?: z.input<typeof JobsTableParamsSchema>) {
  return useTableGet({
    endpoint: `projects/${projectId}/jobs`,
    initialParams: initialParams || {},
    responseSchema: JobsResponseSchema,
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
    responseSchema: JobsResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs`],
  });
}

export function useCreateJobBlock(projectId: number, jobId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}`],
  });
}
export function useUpdateJobBlock(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlockUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}`],
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
      response: JobsResponseSchema,
    },
    {
      path: "/jobs",
      method: "post",
      description: "Create a job",
      body: JobUpdateSchema,
      response: JobsResponseSchema,
    },
    {
      path: "/jobs/{jobId}",
      method: "post",
      description: "Update a job",
      body: JobUpdateSchema,
      response: JobsResponseSchema,
    },
    {
      path: "/jobs/{jobId}",
      method: "get",
      description: "Get a job, including a list of its units",
      response: JobResponseSchema,
    },
  ],
);
