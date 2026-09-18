import { updateEndpoint, useDelete, useGet, useListGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { z } from "zod";
import {
  CodebookNodeCreateSchema,
  CodebookNodeUpdateSchema,
  CodebookNodeUpdateResponseSchema,
  CodebookNodeCreateResponseSchema,
  CodebookNodeResponseSchema,
} from "./schemas";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { useJob } from "../../query";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prepareCodebook } from "@/functions/treeFunctions";

export function useCodebookNodes(projectId: number, jobId?: number) {
  const responseSchema = z.array(CodebookNodeResponseSchema).transform(prepareCodebook);

  return useGet({
    endpoint: `projects/${projectId}/jobs/${jobId}/codebookNodes`,
    responseSchema,
    disabled: !jobId,
  });
}

export function useCreateCodebookNode(projectId: number, jobId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/codebookNodes`,
    bodySchema: CodebookNodeCreateSchema,
    responseSchema: CodebookNodeCreateResponseSchema,
    // EXPERIMENTAL!! If you get weird behavior with failing updates, disable the
    // manual update steps. (manual updates is an optimization only)
    manualUpdateEndpointSchema: z.array(CodebookNodeResponseSchema).transform(prepareCodebook),
    manualUpdateEndpoint: `projects/${projectId}/jobs/${jobId}/codebookNodes`,
    manualUpdate: (result, oldData) => {
      // the added properties are dummies, that will be set correctly in prepareCodebook

      const newData = oldData.map((node) => {
        const treeUpdate = result.tree.find((edge) => edge.id === node.id);
        if (treeUpdate) {
          return { ...node, treeUpdate };
        }
        return node;
      });

      return prepareCodebook([...newData, result.node]);
    },
  });
}

export function useUpdateCodebookNode(projectId: number, jobId: number, codebookNodeId: number) {
  return useMutate({
    endpoint: `projects/${projectId}/jobs/${jobId}/codebookNodes/${codebookNodeId}`,
    bodySchema: CodebookNodeUpdateSchema,
    responseSchema: CodebookNodeUpdateResponseSchema,
    // EXPERIMENTAL!! If you get weird behavior with failing updates, disable the
    // manual update steps and enable the invalidateEndpoints. (manual updates is an optimization only)
    // invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/codebookNodes`],
    manualUpdateEndpointSchema: z.array(CodebookNodeResponseSchema).transform(prepareCodebook),
    manualUpdateEndpoint: `projects/${projectId}/jobs/${jobId}/codebookNodes`,
    manualUpdate: (result, oldData) => {
      console.log(result, oldData);
      const newData = oldData.map((node) => {
        let newNode = node;
        if (result.node && node.id === result.node.id) {
          newNode = { ...node, ...result.node };
        }
        if (result.tree) {
          const treeUpdate = result.tree.find((edge) => edge.id === newNode.id);
          if (treeUpdate) {
            newNode = { ...newNode, ...treeUpdate };
          }
        }
        return newNode;
      });
      console.log(newData);
      return prepareCodebook(newData);
    },
  });
}

export function useDeleteCodebookNode(projectId: number, jobId: number, codebookNodeId: number) {
  return useDelete({
    endpoint: `projects/${projectId}/jobs/${jobId}/codebookNodes/${codebookNodeId}`,
    invalidateEndpoints: [`projects/${projectId}/jobs/${jobId}/codebookNodes`],
    params: { recursive: true },
    dontInvalidateSelf: true,
  });
}

export const openapiCodebook = createOpenAPIDefinitions(
  ["Codebook management"],
  [
    {
      path: "/jobs/{jobId}/codebookNodes",
      method: "get",
      description: "Get the codebook (a list of codebook nodes)",
      response: z.array(CodebookNodeResponseSchema),
    },
    {
      path: "/jobs/{jobId}/codebookNodes",
      method: "post",
      description: "Create a codebook node",
      body: CodebookNodeCreateSchema,
      response: IdResponseSchema,
    },
    {
      path: "/jobs/{jobId}/codebookNodes/{codebookNodeId}",
      method: "post",
      description: "Update a codebook node",
      body: CodebookNodeUpdateSchema,
      response: IdResponseSchema,
    },
    {
      path: "/jobs/{jobId}/codebookNodes/{codebookNodeId}",
      method: "delete",
      description: "Delete a codebook node",
      response: IdResponseSchema,
    },
  ],
);
