import { z } from "zod";
import {
  UnitDataCreateBodySchema,
  UnitDataCreateResponseSchema,
  UnitDataDeleteBodySchema,
  UnitDataResponseSchema,
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
      description: "Create a unit",
      body: UnitDataCreateBodySchema,
      response: UnitDataCreateResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/unitset",
      method: "get",
      description: "Get all unit unitset",
      response: z.array(UnitDataResponseSchema),
    },
  ],
);
