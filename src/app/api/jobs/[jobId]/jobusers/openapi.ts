import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { JobUsersTableParamsSchema, JobUsersResponseSchema, JobUsersCreateOrUpdateSchema } from "./schemas";

export const openapiUsers = createOpenAPIDefinitions(
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
      description: "Create a job user",
      body: JobUsersCreateOrUpdateSchema,
    },
    {
      path: "job/{jobId}/jobusers",
      method: "put",
      description: "Update a job  user",
      body: JobUsersCreateOrUpdateSchema,
    },
  ],
);
