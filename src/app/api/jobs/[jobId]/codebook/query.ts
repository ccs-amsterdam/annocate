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

export function useCodebooks(jobId: number, initialParams?: z.infer<typeof CodebooksTableParamsSchema>) {
  return useTableGet({
    resource: "codebook",
    endpoint: `jobs/${jobId}/codebook`,
    initialParams,
    responseSchema: CodebooksResponseSchema,
  });
}

export function useUpdateCodebook(jobId: number, codebookId: number) {
  return useMutate({
    method: `post`,
    resource: `codebook`,
    endpoint: `jobs/${jobId}/codebook/${codebookId}`,
    bodySchema: CodebookUpdateBodySchema,
  });
}

export function useCreateCodebook(jobId: number) {
  return useMutate({
    method: `post`,
    resource: `codebook`,
    endpoint: `jobs/${jobId}/codebook`,
    bodySchema: CodebookCreateBodySchema,
  });
}

export function useCodebook(jobId: number, codebookId: number) {
  return useGet({
    resource: "codebook",
    endpoint: `jobs/${jobId}/codebook/${codebookId}`,
    responseSchema: CodebookResponseSchema,
  });
}

export const openapiCodebook = createOpenAPIDefinitions(
  ["Codebook management"],
  [
    {
      path: "/jobs/{jobId}/codebook",
      method: "get",
      description: "Get all codebooks",
      params: CodebooksTableParamsSchema,
      response: CodebooksResponseSchema,
    },
    {
      path: "/jobs/{jobId}/codebook",
      method: "post",
      description: "Create a codebook",
      body: CodebookCreateBodySchema,
      response: CodebookResponseSchema,
    },
    {
      path: "/jobs/{jobId}/codebook/{codebookId}",
      method: "get",
      description: "Get a codebook",
      response: CodebookResponseSchema,
    },
    {
      path: "/jobs/{jobId}/codebook/{codebookId}",
      method: "post",
      description: "Update a codebook",
      body: CodebookUpdateBodySchema,
      response: CodebookResponseSchema,
    },
  ],
);
