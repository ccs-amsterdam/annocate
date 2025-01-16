import { useDelete, useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { z } from "zod";
import { JobBlockCreateSchema, JobBlockResponseSchema, JobBlockUpdateSchema } from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";

export function useCreateJobBlock(projectId: number, jobId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}`, `projects/${projectId}/codebooks`],
  });
}
export function useUpdateJobBlock(projectId: number, jobId: number, blockId?: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: JobBlockUpdateSchema,
    responseSchema: IdResponseSchema,
    invalidateEndpoints: [
      `projects/${projectId}/jobs`,
      `projects/${projectId}/jobs/${jobId}`,
      `projects/${projectId}/codebooks`,
    ],
  });
}

export function useDeleteJobBlock(projectId: number, jobId: number, blockId: number) {
  return useDelete({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}`, `projects/${projectId}/codebooks`],
  });
}

export function useJobBlock(projectId: number, jobId?: number, blockId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    responseSchema: JobBlockResponseSchema,
    disabled: !blockId || !jobId,
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
      body: JobBlockUpdateSchema,
    },
    { path: "/jobs/{jobId}/blocks/{blockId}", method: "delete", description: "Delete a block" },
    { path: "/jobs/{jobId}/blocks/{blockId}/units", method: "get", description: "Get a list of units for a block" },
  ],
);
