import { JobsCreateSchema, JobsResponseSchema, JobsTableParamsSchema, JobsUpdateSchema } from "@/app/api/jobs/schemas";
import { z } from "zod";
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
