import { useMutate } from "@/app/api/queryHelpers";
import { z } from "zod";
import { useTableGet } from "@/app/api/queryHelpers";
import { JobUsersCreateOrUpdateSchema, JobUsersResponseSchema, JobUsersTableParamsSchema } from "./schemas";

export function useJobUsers(jobId: number, initialParams?: z.infer<typeof JobUsersTableParamsSchema>) {
  return useTableGet({
    resource: "jobusers",
    endpoint: `jobs/${jobId}/jobusers`,
    initialParams,
    responseSchema: JobUsersResponseSchema,
  });
}

export function useCreateOrUpdateJobUsers(jobId: number) {
  return useMutate({
    method: `post`,
    resource: `jobusers`,
    endpoint: `jobs/${jobId}/jobusers`,
    bodySchema: JobUsersCreateOrUpdateSchema,
  });
}

export function useUpdateJobUsers(jobId: number) {
  return useMutate({
    method: `put`,
    resource: `jobusers`,
    endpoint: `jobs/${jobId}/jobusers`,
    bodySchema: JobUsersCreateOrUpdateSchema,
  });
}
