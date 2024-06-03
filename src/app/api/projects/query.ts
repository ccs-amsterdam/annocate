import {
  ProjectsCreateSchema,
  ProjectsResponseSchema,
  ProjectsTableParamsSchema,
  ProjectsUpdateSchema,
} from "@/app/api/projects/schemas";
import { z } from "zod";
import { createOpenAPIDefinitions } from "../openapiHelpers";
import { useGet, useMutate, useTableGet } from "../queryHelpers";

export function useProjects(initialParams?: z.infer<typeof ProjectsTableParamsSchema>) {
  return useTableGet({
    resource: "projects",
    endpoint: "projects",
    initialParams,
    responseSchema: ProjectsResponseSchema,
  });
}

export function useProject(projectId: number) {
  return useGet({ resource: "projects", endpoint: `projects/${projectId}`, responseSchema: ProjectsResponseSchema });
}

export function useCreateProject() {
  return useMutate({
    resource: "projects",
    endpoint: "projects",
    bodySchema: ProjectsCreateSchema,
    responseSchema: ProjectsResponseSchema,
  });
}
export function useUpdateProject(projectId: number) {
  return useMutate({
    resource: "projects",
    endpoint: `projects/${projectId}`,
    bodySchema: ProjectsUpdateSchema,
    responseSchema: ProjectsResponseSchema,
  });
}

export const openapiProjects = createOpenAPIDefinitions(
  ["Project management"],
  [
    {
      path: "/projects",
      method: "get",
      description: "Get all projects",
      params: ProjectsTableParamsSchema,
      response: ProjectsResponseSchema,
    },
    {
      path: "/projects",
      method: "post",
      description: "Create a project",
      body: ProjectsUpdateSchema,
      response: ProjectsResponseSchema,
    },
    {
      path: "/projects/{userId}",
      method: "post",
      description: "Update a project",
      body: ProjectsUpdateSchema,
      response: ProjectsResponseSchema,
    },
  ],
);
