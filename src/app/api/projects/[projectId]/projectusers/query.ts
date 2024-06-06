import { useMutate } from "@/app/api/queryHelpers";
import { z } from "zod";
import { useTableGet } from "@/app/api/queryHelpers";
import { ProjectUsersCreateOrUpdateSchema, ProjectUsersResponseSchema, ProjectUsersTableParamsSchema } from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";

export function useProjectUsers(projectId: number, initialParams?: z.infer<typeof ProjectUsersTableParamsSchema>) {
  return useTableGet({
    resource: "projectusers",
    endpoint: `projects/${projectId}/projectusers`,
    initialParams: initialParams || {},
    responseSchema: ProjectUsersResponseSchema,
  });
}

export function useCreateOrUpdateProjectUser(projectId: number) {
  return useMutate({
    method: `post`,
    resource: `projectusers`,
    endpoint: `projects/${projectId}/projectusers`,
    bodySchema: ProjectUsersCreateOrUpdateSchema,
  });
}

export const openapiProjectUsers = createOpenAPIDefinitions(
  ["Job user management"],
  [
    {
      path: "job/{projectId}/projectusers",
      method: "get",
      description: "Get all job users",
      params: ProjectUsersTableParamsSchema,
      response: ProjectUsersResponseSchema,
    },
    {
      path: "job/{projectId}/projectusers",
      method: "post",
      description:
        "Create or update a job user. If the user already exists, it will be updated. Otherwise, it will be created.",
      body: ProjectUsersCreateOrUpdateSchema,
    },
  ],
);
