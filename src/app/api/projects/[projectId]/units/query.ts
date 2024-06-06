import { z } from "zod";
import {
  UnitDataCreateBodySchema,
  UnitDataCreateResponseSchema,
  UnitDataResponseSchema,
  UnitDataTableParamsSchema,
} from "./schemas";
import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import { UnitsetsResponseSchema } from "./unitsets/schemas";

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
  });
}

export function useUnitsets(projectId: number) {
  return useGet({
    resource: "unitUnitsets",
    endpoint: `projects/${projectId}/units/unitsets`,
    responseSchema: z.array(UnitsetsResponseSchema),
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
