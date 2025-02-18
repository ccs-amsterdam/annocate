import {
  ProjectResponseSchema,
  ProjectsCreateSchema,
  ProjectsResponseSchema,
  ProjectsTableParamsSchema,
  ProjectsUpdateSchema,
} from "@/app/api/projects/schemas";
import { z } from "zod";
import { createOpenAPIDefinitions } from "../openapiHelpers";
import { useGet, useMutate, useTableGet } from "../queryHelpers";

export function useProjects(initialParams?: z.input<typeof ProjectsTableParamsSchema>) {
  return useTableGet({
    endpoint: "projects",
    initialParams: initialParams || {},
    responseSchema: ProjectsResponseSchema,
  });
}

export function useCreateProject() {
  return useMutate({
    endpoint: "projects",
    bodySchema: ProjectsCreateSchema,
    responseSchema: ProjectsResponseSchema,
  });
}

export function useProject(projectId: number | undefined) {
  return useGet({ endpoint: `projects/${projectId}`, responseSchema: ProjectResponseSchema, disabled: !projectId });
}

export function useUpdateProject(projectId: number) {
  return useMutate({
    endpoint: `projects/${projectId}`,
    bodySchema: ProjectsUpdateSchema,
    responseSchema: ProjectsResponseSchema,
    invalidateEndpoints: [`projects`],
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
