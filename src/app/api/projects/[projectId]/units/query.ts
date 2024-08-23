import { z } from "zod";
import {
  UnitDataCreateBodySchema,
  UnitDataCreateResponseSchema,
  UnitDataDeleteBodySchema,
  UnitDataResponseSchema,
  UnitDataRowSchema,
  UnitDataTableParamsSchema,
} from "./schemas";
import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { IdResponseSchema, voidResponseSchema } from "@/app/api/schemaHelpers";

export function useUnits(projectId: number, initialParams: z.input<typeof UnitDataTableParamsSchema>) {
  return useTableGet({
    endpoint: `projects/${projectId}/units`,
    initialParams,
    responseSchema: UnitDataResponseSchema,
  });
}

export function useCreateUnits(projectId: number) {
  return useMutate({
    method: "post",
    endpoint: `projects/${projectId}/units`,
    bodySchema: UnitDataCreateBodySchema,
    responseSchema: voidResponseSchema,
  });
}

export function useDeleteUnits(projectId: number) {
  return useMutate({
    method: "post",
    endpoint: `projects/${projectId}/units/delete`,
    bodySchema: UnitDataDeleteBodySchema,
    responseSchema: voidResponseSchema,
    invalidateEndpoints: [`projects/${projectId}/units`],
  });
}

export function usePreviewUnit(projectId: number, position: number, blockId?: number) {
  return useGet({
    endpoint: `projects/${projectId}/units/preview`,
    params: { blockId, position },
    responseSchema: UnitDataRowSchema,
  });
}

export function useGetUnit(projectId: number, unitId: string) {
  return useGet({
    endpoint: `projects/${projectId}/units/${unitId}`,
    responseSchema: UnitDataRowSchema,
  });
}

export const openapiUnits = createOpenAPIDefinitions(
  ["Unit management"],
  [
    {
      path: "/projects/{projectId}/units",
      method: "get",
      description: "Get all units",
      params: UnitDataTableParamsSchema,
      response: UnitDataResponseSchema,
    },
    {
      path: "/projects/{projectId}/units",
      method: "post",
      description: "Create units. By default a project can have up to 20000 units.",
      body: UnitDataCreateBodySchema,
      response: UnitDataCreateResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/delete",
      method: "post",
      description: "Delete units",
      body: UnitDataDeleteBodySchema,
      response: voidResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/previewUnits",
      method: "get",
      description: "Preview units",
      response: UnitDataResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/{unitId}",
      method: "get",
      description: "Get a single unit by unitId",
      response: UnitDataRowSchema,
    },
  ],
);
