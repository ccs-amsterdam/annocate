import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { z } from "zod";
import {
  CodebookCreateBodySchema,
  CodebookResponseSchema,
  CodebooksResponseSchema,
  CodebooksTableParamsSchema,
  CodebookUpdateBodySchema,
} from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";

export function useCodebooks(projectId: number, initialParams?: z.infer<typeof CodebooksTableParamsSchema>) {
  return useTableGet({
    resource: "codebook",
    endpoint: `projects/${projectId}/codebook`,
    initialParams,
    responseSchema: CodebooksResponseSchema,
  });
}

export function useUpdateCodebook(projectId: number, codebookId: number) {
  return useMutate({
    method: `post`,
    resource: `codebook`,
    endpoint: `projects/${projectId}/codebook/${codebookId}`,
    bodySchema: CodebookUpdateBodySchema,
  });
}

export function useCreateCodebook(projectId: number) {
  return useMutate({
    method: `post`,
    resource: `codebook`,
    endpoint: `projects/${projectId}/codebook`,
    bodySchema: CodebookCreateBodySchema,
  });
}

export function useCodebook(projectId: number, codebookId: number) {
  return useGet({
    resource: "codebook",
    endpoint: `projects/${projectId}/codebook/${codebookId}`,
    responseSchema: CodebookResponseSchema,
  });
}

export const openapiCodebook = createOpenAPIDefinitions(
  ["Codebook management"],
  [
    {
      path: "/projects/{projectId}/codebook",
      method: "get",
      description: "Get all codebooks",
      params: CodebooksTableParamsSchema,
      response: CodebooksResponseSchema,
    },
    {
      path: "/projects/{projectId}/codebook",
      method: "post",
      description: "Create a codebook",
      body: CodebookCreateBodySchema,
      response: CodebookResponseSchema,
    },
    {
      path: "/projects/{projectId}/codebook/{codebookId}",
      method: "get",
      description: "Get a codebook",
      response: CodebookResponseSchema,
    },
    {
      path: "/projects/{projectId}/codebook/{codebookId}",
      method: "post",
      description: "Update a codebook",
      body: CodebookUpdateBodySchema,
      response: CodebookResponseSchema,
    },
  ],
);
