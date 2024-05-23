import { JobsCreateSchema, JobsResponseSchema, JobsTableParamsSchema, JobsUpdateSchema } from "@/app/api/jobs/schemas";
import { z } from "zod";
import { createOpenAPIDefinitions } from "../openapiHelpers";
import { useGet, useMutate, useTableGet } from "../queryHelpers";

export function useJobs(initialParams?: z.infer<typeof JobsTableParamsSchema>) {
  return useTableGet({
    resource: "jobs",
    endpoint: "jobs",
    initialParams,
    responseSchema: JobsResponseSchema,
  });
}

export function useJob(jobId: number) {
  return useGet({ resource: "jobs", endpoint: `jobs/${jobId}`, responseSchema: JobsResponseSchema });
}

export function useCreateJob() {
  return useMutate({
    resource: "jobs",
    endpoint: "jobs",
    bodySchema: JobsCreateSchema,
    responseSchema: JobsResponseSchema,
  });
}
export function useUpdateJob(jobId: number) {
  return useMutate({
    resource: "jobs",
    endpoint: `jobs/${jobId}`,
    bodySchema: JobsUpdateSchema,
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
      body: JobsUpdateSchema,
      response: JobsResponseSchema,
    },
    {
      path: "/jobs/{userId}",
      method: "post",
      description: "Update a job",
      body: JobsUpdateSchema,
      response: JobsResponseSchema,
    },
  ],
);
