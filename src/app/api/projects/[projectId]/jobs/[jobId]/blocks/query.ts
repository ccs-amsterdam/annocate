import { useDelete, useGet, useListGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { z } from "zod";
import {
  JobBlockCreateSchema,
  JobBlockTreeResponseSchema,
  JobBlockTreeUpdateSchema,
  JobBlockContentUpdateSchema,
  JobBlockResponseSchema,
  JobBlockUpdateSchema,
  JobBlocksResponseSchema,
  JobBlockDeleteSchema,
} from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { useJob } from "../../query";
import { useMemo } from "react";

export function useJobBlocks(projectId: number, jobId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    responseSchema: z.array(JobBlocksResponseSchema),
    disabled: !jobId,
  });
}

export function useCreateJobBlock(projectId: number, jobId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [],
  });
}

export function useJobBlock(projectId: number, jobId?: number, blockId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    responseSchema: JobBlockResponseSchema,
    disabled: !blockId || !jobId,
  });
}

export function useUpdateJobBlock(projectId: number, jobId: number, blockId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlockUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/blocks`],
  });
}

export function useDeleteJobBlock(projectId: number, jobId: number, blockId: number) {
  return useDelete({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/blocks`],
    params: { recursive: true },
    dontInvalidateSelf: true,
  });
}

// The following queries reuse the GET jobblock and UPDATE jobblock endpoints,
// but separately for the TREE and CONTENT components for efficient caching.
export function useJobBlocksTree(projectId: number, jobId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    params: { treeOnly: true },
    responseSchema: z.array(JobBlockTreeResponseSchema),
    disabled: !jobId,
  });
}

export function useUpdateJobBlockTree(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlockTreeUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/blocks`],
  });
}

export function useUpdateJobBlockContent(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlockContentUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [],
  });
}

export function useListJobBlockContent(projectId: number, jobId: number) {
  const tree = useJobBlocksTree(projectId, jobId);
  const endpoints = tree?.data?.map((block) => `projects/${projectId}/jobs/${jobId}/blocks/${block.id}`) || [];
  return useListGet({
    endpoints,
    responseSchema: JobBlockResponseSchema,
    disabled: !jobId,
  });
}

export const openapiCodebook = createOpenAPIDefinitions(
  ["Codebook management"],
  [
    {
      path: "/jobs/{jobId}/blocks",
      method: "get",
      description: "Get a list of blocks for a job",
      response: z.array(JobBlocksResponseSchema),
    },
    {
      path: "/jobs/{jobId}/blocks",
      method: "post",
      description: "Create a block",
      body: JobBlockCreateSchema,
      response: IdResponseSchema,
    },
    {
      path: "/jobs/{jobId}/blocks/{blockId}",
      method: "get",
      description: "Get a job block",
      response: JobBlockResponseSchema,
    },
    {
      path: "/jobs/{jobId}/blocks/{blockId}",
      method: "post",
      description: "Update a block",
      body: JobBlockUpdateSchema,
      response: IdResponseSchema,
    },
    {
      path: "/jobs/{jobId}/blocks/{blockId}",
      method: "delete",
      description: "Delete a block",
      response: IdResponseSchema,
    },
  ],
);
