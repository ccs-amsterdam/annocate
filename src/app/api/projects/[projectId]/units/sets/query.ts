import { z } from "zod";
import {
  UnitSetsCreateBodySchema,
  UnitSetsCreateResponseSchema,
  UnitSetsResponseSchema,
  UnitSetsTableParamsSchema,
} from "./schemas";
import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";

export function useUnitSets(projectId: number, initialParams?: z.infer<typeof UnitSetsTableParamsSchema>) {
  return useTableGet({
    resource: "unitset",
    endpoint: `projects/${projectId}/units/sets`,
    initialParams,
    responseSchema: UnitSetsResponseSchema,
  });
}

export function useCreateUnitSet(projectId: number) {
  return useMutate({
    method: "post",
    resource: "unitset",
    endpoint: `projects/${projectId}/units/sets`,
    bodySchema: UnitSetsCreateBodySchema,
    responseSchema: UnitSetsCreateResponseSchema,
  });
}

export function useUpdateUnitSet(projectId: number, unitsetId: number) {
  return useMutate({
    method: "post",
    resource: "unitset",
    endpoint: `projects/${projectId}/units/sets/${unitsetId}`,
    bodySchema: UnitSetsCreateBodySchema,
    responseSchema: UnitSetsCreateResponseSchema,
  });
}

export function useUnitSet(projectId: number, unitsetId: number) {
  return useGet({
    resource: "unitset",
    endpoint: `projects/${projectId}/units/sets/${unitsetId}`,
    responseSchema: UnitSetsResponseSchema,
  });
}

export const openapiUnitSet = createOpenAPIDefinitions(
  ["Unit Set management"],
  [
    {
      path: "/projects/{projectId}/units/sets",
      method: "get",
      description: "Get all unit sets",
      params: UnitSetsTableParamsSchema,
      response: UnitSetsResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/sets",
      method: "post",
      description: "Create a unit set",
      body: UnitSetsCreateBodySchema,
      response: UnitSetsCreateResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/sets/{unitsetId}",
      method: "post",
      description: "Update a unit set",
      body: UnitSetsCreateBodySchema,
      response: UnitSetsCreateResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/sets/{unitsetId}",
      method: "get",
      description: "Get a unit set",
      response: UnitSetsResponseSchema,
    },
  ],
);
