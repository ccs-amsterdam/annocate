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
import { UnitsetDeleteBodySchema, UnitsetResponseSchema, UnitsetsResponseSchema } from "./unitsets/schemas";

export function useUnits(projectId: number, initialParams: z.input<typeof UnitDataTableParamsSchema>) {
  return useTableGet({
    resource: "unit",
    endpoint: `projects/${projectId}/units`,
    initialParams,
    responseSchema: UnitDataResponseSchema,
  });
}

export function useCreateUnits(projectId: number) {
  return useMutate({
    method: "post",
    resource: "unit",
    endpoint: `projects/${projectId}/units`,
    bodySchema: UnitDataCreateBodySchema,
    invalidateResources: ["unitset"],
  });
}

export function useUnitsets(projectId: number) {
  return useGet({
    resource: "unitset",
    endpoint: `projects/${projectId}/units/unitsets`,
    responseSchema: z.array(UnitsetsResponseSchema),
  });
}

export function useDeleteUnits(projectId: number) {
  return useMutate({
    method: "post",
    resource: "unit",
    endpoint: `projects/${projectId}/units/delete`,
    bodySchema: UnitDataDeleteBodySchema,
    invalidateResources: ["unitset"],
  });
}

export function useDeleteUnitsets(projectId: number) {
  return useMutate({
    method: "post",
    resource: "unitset",
    endpoint: `projects/${projectId}/units/unitsets/delete`,
    bodySchema: UnitsetDeleteBodySchema,
    invalidateResources: ["unit"],
  });
}

// export function useUnitset(projectId: number, unitsetId: number | undefined) {
//   return useGet({
//     resource: "unitUnitsets",
//     endpoint: `projects/${projectId}/units/unitsets/${unitsetId}`,
//     responseSchema: UnitsetResponseSchema,
//     disabled: unitsetId === undefined,
//   });
// }

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
