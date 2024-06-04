import { z } from "zod";
import {
  UnitDataCreateBodySchema,
  UnitDataCreateResponseSchema,
  UnitDataResponseSchema,
  UnitDataTableParamsSchema,
} from "./schemas";
import { useMutate, useTableGet } from "@/app/api/queryHelpers";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";

export function useUnits(projectId: number, initialParams?: z.infer<typeof UnitDataTableParamsSchema>) {
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
  ],
);
