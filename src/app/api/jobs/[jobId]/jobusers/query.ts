import { useMutate } from "@/app/api/queryHelpers";
import { z } from "zod";
import { useTableGet } from "@/app/api/queryHelpers";
import { JobUsersCreateOrUpdateSchema, JobUsersResponseSchema, JobUsersTableParamsSchema } from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";

export function useJobUsers(jobId: number, initialParams?: z.infer<typeof JobUsersTableParamsSchema>) {
  return useTableGet({
    resource: "jobusers",
    endpoint: `jobs/${jobId}/jobusers`,
    initialParams,
    responseSchema: JobUsersResponseSchema,
  });
}

export function useCreateOrUpdateJobUser(jobId: number) {
  return useMutate({
    method: `post`,
    resource: `jobusers`,
    endpoint: `jobs/${jobId}/jobusers`,
    bodySchema: JobUsersCreateOrUpdateSchema,
  });
}

export const openapiJobUsers = createOpenAPIDefinitions(
  ["Job user management"],
  [
    {
      path: "job/{jobId}/jobusers",
      method: "get",
      description: "Get all job users",
      params: JobUsersTableParamsSchema,
      response: JobUsersResponseSchema,
    },
    {
      path: "job/{jobId}/jobusers",
      method: "post",
      description:
        "Create or update a job user. If the user already exists, it will be updated. Otherwise, it will be created.",
      body: JobUsersCreateOrUpdateSchema,
    },
  ],
);
