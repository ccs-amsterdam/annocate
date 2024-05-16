import { JobsResponseSchema, JobsTableParamsSchema, JobsUpdateSchema } from "@/app/api/jobs/schemas";
import { z } from "zod";
import { useGet, useTableGet, useUpdate } from "../queryHelpers";

export function useJobs(initialParams?: z.infer<typeof JobsTableParamsSchema>) {
  return useTableGet({
    endpoint: "jobs",
    initialParams,
    responseSchema: JobsResponseSchema,
  });
}

export function useJob(jobId: number) {
  return useGet("jobs", jobId, JobsResponseSchema);
}

export function useUpdateJobs(jobId?: number) {
  return useUpdate("jobs", JobsUpdateSchema, JobsResponseSchema, jobId);
}
