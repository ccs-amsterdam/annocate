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
import { IdResponseSchema } from "@/app/api/schemaHelpers";

export function useCodebooks(projectId: number, initialParams?: z.infer<typeof CodebooksTableParamsSchema>) {
  return useTableGet({
    endpoint: `projects/${projectId}/codebooks`,
    initialParams: initialParams || {},
    responseSchema: CodebooksResponseSchema,
  });
}

export function useCreateCodebook(projectId: number) {
  return useMutate({
    method: `post`,
    endpoint: `projects/${projectId}/codebooks`,
    bodySchema: CodebookCreateBodySchema,
    responseSchema: IdResponseSchema,
  });
}

export function useUpdateCodebook(projectId: number, codebookId: number) {
  return useMutate({
    method: `post`,
    endpoint: `projects/${projectId}/codebooks/${codebookId}`,
    bodySchema: CodebookUpdateBodySchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/codebooks`],
  });
}

export function useCodebook(projectId: number, codebookId: number | undefined) {
  return useGet({
    endpoint: `projects/${projectId}/codebooks`,
    endpointId: String(codebookId),
    responseSchema: CodebookResponseSchema,
    disabled: codebookId === undefined,
  });
}

export const openapiCodebook = createOpenAPIDefinitions(
  ["Codebook management"],
  [
    {
      path: "/projects/{projectId}/codebooks",
      method: "get",
      description: "Get all codebooks",
      params: CodebooksTableParamsSchema,
      response: CodebooksResponseSchema,
    },
    {
      path: "/projects/{projectId}/codebooks",
      method: "post",
      description: "Create a codebook",
      body: CodebookCreateBodySchema,
      response: CodebookResponseSchema,
    },
    {
      path: "/projects/{projectId}/codebooks/{codebookId}",
      method: "get",
      description: "Get a codebook",
      response: CodebookResponseSchema,
    },
    {
      path: "/projects/{projectId}/codebooks/{codebookId}",
      method: "post",
      description: "Update a codebook",
      body: CodebookUpdateBodySchema,
      response: CodebookResponseSchema,
    },
  ],
);
