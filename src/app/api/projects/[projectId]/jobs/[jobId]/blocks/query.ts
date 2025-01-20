import { useDelete, useGet, useListGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { z } from "zod";
import {
  JobBlockContentResponseSchema,
  JobBlockCreateSchema,
  JobBlockMetaResponseSchema,
  JobBlockMetaUpdateSchema,
  JobBlockContentUpdateSchema,
} from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { useJob } from "../../query";
import { useMemo } from "react";

export function useCreateJobBlock(projectId: number, jobId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [],
  });
}

export function useUpdateJobBlockMeta(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}/meta`,
    bodySchema: JobBlockMetaUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/blocks`],
  });
}

export function useUpdateJobBlockContent(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}/content`,
    bodySchema: JobBlockContentUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [],
  });
}

export function useDeleteJobBlock(projectId: number, jobId: number, blockId: number) {
  return useDelete({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}`, `projects/${projectId}/codebooks`],
  });
}

export function useJobBlocksMeta(projectId: number, jobId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    responseSchema: z.array(JobBlockMetaResponseSchema),
    disabled: !jobId,
  });
}

export function useJobBlockContent(projectId: number, jobId?: number, blockId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}/content`,
    responseSchema: JobBlockContentResponseSchema,
    disabled: !blockId || !jobId,
  });
}

export function useListJobBlockContent(projectId: number, jobId: number) {
  const blocks = useJobBlocksMeta(projectId, jobId);
  const endpoints =
    blocks?.data?.map((block) => `projects/${projectId}/jobs/${jobId}/blocks/${block.id}/content`) || [];
  return useListGet({
    endpoints,
    responseSchema: JobBlockContentResponseSchema,
    disabled: !jobId,
  });
}

export const openapiCodebook = createOpenAPIDefinitions(
  ["Codebook management"],
  [
    { path: "/jobs/{jobId}/blocks", method: "post", description: "Create a block", body: JobBlockCreateSchema },
    {
      path: "/jobs/{jobId}/blocks/{blockId}",
      method: "post",
      description: "Update a block",
      body: JobBlockMetaUpdateSchema,
    },
    { path: "/jobs/{jobId}/blocks/{blockId}", method: "delete", description: "Delete a block" },
    { path: "/jobs/{jobId}/blocks/{blockId}/units", method: "get", description: "Get a list of units for a block" },
  ],
);
