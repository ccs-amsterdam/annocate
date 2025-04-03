import { updateEndpoint, useDelete, useGet, useListGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { z } from "zod";
import {
  CodebookNodeCreateSchema,
  CodebookNodeUpdateSchema,
  CodebookNodeResponseSchema,
  CodebookNodeDeleteSchema,
  CodebookNodeServerResponseSchema,
  CodebookNodeUpdateResponseSchema,
  CodebookNodeCreateResponseSchema,
} from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { useJob } from "../../query";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sortNestedBlocks } from "@/functions/treeFunctions";

export function useCodebookNodes(projectId: number, jobId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    responseSchema: z.array(CodebookNodeResponseSchema),
    disabled: !jobId,
    processResponse: (data) => {
      const serverResponse = z.array(CodebookNodeServerResponseSchema).parse(data);
      return sortNestedBlocks(serverResponse);
    },
  });
}

export function useCreateCodebookNode(projectId: number, jobId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    bodySchema: CodebookNodeCreateSchema,
    responseSchema: CodebookNodeCreateResponseSchema,
    // EXPERIMENTAL!! If you get weird behavior with failing updates, disable the
    // manual update steps. (manual updates is an optimization only)
    manualUpdateSchema: z.array(CodebookNodeResponseSchema),
    manualUpdateEndpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    manualUpdate: (result, oldData) => {
      oldData.push({ ...result.block, level: -1, children: 0 });

      const newData = oldData.map((block) => {
        const treeUpdate = result.tree.find((edge) => edge.id === block.id);
        if (treeUpdate) {
          return { ...block, treeUpdate };
        }
        return block;
      });

      return sortNestedBlocks(newData);
    },
  });
}

export function useUpdateCodebookNode(projectId: number, jobId: number, blockId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    bodySchema: CodebookNodeUpdateSchema,
    responseSchema: CodebookNodeUpdateResponseSchema,
    // EXPERIMENTAL!! If you get weird behavior with failing updates, disable the
    // manual update steps and enable the invalidateEndpoints. (manual updates is an optimization only)
    // invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/blocks`],
    manualUpdateSchema: z.array(CodebookNodeResponseSchema),
    manualUpdateEndpoint: `projects/${projectId}/jobs/${jobId}/blocks`,
    manualUpdate: (result, oldData) => {
      console.log(result, oldData);
      const newData = oldData.map((block) => {
        let newBlock = block;
        if (result.block && block.id === result.block.id) {
          newBlock = { ...block, ...result.block };
        }
        if (result.tree) {
          const treeUpdate = result.tree.find((edge) => edge.id === newBlock.id);
          if (treeUpdate) {
            newBlock = { ...newBlock, ...treeUpdate };
          }
        }
        return newBlock;
      });
      return sortNestedBlocks(newData);
    },
  });
}

export function useDeleteCodebookNode(projectId: number, jobId: number, blockId: number) {
  return useDelete({
    endpoint: `projects/${projectId}/jobs/${jobId}/blocks/${blockId}`,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/blocks`],
    params: { recursive: true },
    dontInvalidateSelf: true,
  });
}

export const openapiCodebook = createOpenAPIDefinitions(
  ["Codebook management"],
  [
    {
      path: "/jobs/{jobId}/blocks",
      method: "get",
      description: "Get a list of blocks for a job",
      response: z.array(CodebookNodeServerResponseSchema),
    },
    {
      path: "/jobs/{jobId}/blocks",
      method: "post",
      description: "Create a block",
      body: CodebookNodeCreateSchema,
      response: IdResponseSchema,
    },
    {
      path: "/jobs/{jobId}/blocks/{blockId}",
      method: "post",
      description: "Update a block",
      body: CodebookNodeUpdateSchema,
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
