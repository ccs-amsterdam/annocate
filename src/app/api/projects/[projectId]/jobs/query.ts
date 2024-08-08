import {
  JobCreateSchema,
  JobResponseSchema,
  JobsResponseSchema,
  JobsTableParamsSchema,
  JobUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/schemas";
import { z } from "zod";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";

export function useJobs(projectId: number, initialParams?: z.input<typeof JobsTableParamsSchema>) {
  return useTableGet({
    resource: "jobs",
    endpoint: `projects/${projectId}/jobs`,
    initialParams: initialParams || {},
    responseSchema: JobsResponseSchema,
  });
}

export function useJob(projectId: number, jobId: number) {
  return useGet({
    resource: "jobs",
    endpoint: `projects/${projectId}/jobs/${jobId}`,
    responseSchema: JobsResponseSchema,
  });
}

export function useCreateJob(projectId: number) {
  return useMutate({
    resource: "jobs",
    endpoint: `projects/${projectId}/jobs`,
    bodySchema: JobCreateSchema,
    responseSchema: JobsResponseSchema,
  });
}
export function useUpdateJob(projectId: number, jobId?: number) {
  return useMutate({
    resource: "jobs",
    endpoint: `projects/${projectId}/jobs/${jobId}`,
    bodySchema: JobUpdateSchema,
    responseSchema: JobsResponseSchema,
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
