import { updateEndpoint, useDelete, useGet, useListGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { z } from "zod";
import {
  JobBlockCreateSchema,
  JobBlocksTreeUpdateSchema,
  JobBlockContentUpdateSchema,
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

// We separate updating the tree and content, because when updating the content
// we can update the cache manually without requiring a refetch of the data.
// (we do currently refetch content when tree is updated, which might be avoided,
// but we can think of this later)
export function useUpdateJobBlockTree(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlocksTreeUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/blocks`],
  });
}

export function useUpdateJobBlockContent(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlockContentUpdateSchema,
    responseSchema: IdResponseSchema,
    manualUpdate: (data) => {
      updateEndpoint(`projects/${projectId}/jobs/${jobId}/blocks`, z.array(JobBlocksResponseSchema), (oldData) => {
        const newData = oldData.map((block) => {
          if (block.id === blockId) {
            for (const [key, value] of Object.entries(data)) {
              if (!["name", "content"].includes(key)) {
                throw new Error(`!! check the useUpdateJobBlockContent manual update function`);
              }
              if (data.name) block.name = data.name;
              if (data.content) block.content = data.content;
            }
          }
          return block;
        });

        return newData;
      });
    },
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
