import { z } from "zod";
import {
  UnitLayoutResponseSchema,
  UnitLayoutsCreateBodySchema,
  UnitLayoutsCreateResponseSchema,
  UnitLayoutsResponseSchema,
  UnitLayoutsTableParamsSchema,
} from "./schemas";
import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";

export function useUnitLayouts(projectId: number, initialParams?: z.infer<typeof UnitLayoutsTableParamsSchema>) {
  return useTableGet({
    resource: "layout",
    endpoint: `projects/${projectId}/units/layouts`,
    initialParams: initialParams || {},
    responseSchema: UnitLayoutsResponseSchema,
  });
}

export function useCreateUnitLayout(projectId: number) {
  return useMutate({
    method: "post",
    resource: "layout",
    endpoint: `projects/${projectId}/units/layouts`,
    bodySchema: UnitLayoutsCreateBodySchema,
    responseSchema: UnitLayoutsCreateResponseSchema,
  });
}

export function useUpdateUnitLayout(projectId: number, layoutId: number) {
  return useMutate({
    method: "post",
    resource: "layout",
    endpoint: `projects/${projectId}/units/layouts/${layoutId}`,
    bodySchema: UnitLayoutsCreateBodySchema,
    responseSchema: UnitLayoutsCreateResponseSchema,
  });
}

export function useUnitLayout(projectId: number, layoutId: number | undefined) {
  return useGet({
    resource: "layout",
    endpoint: `projects/${projectId}/units/layouts/${layoutId}`,
    responseSchema: UnitLayoutResponseSchema,
    disabled: layoutId === undefined,
  });
}

export const openapiUnitLayout = createOpenAPIDefinitions(
  ["Unit Layout management"],
  [
    {
      path: "/projects/{projectId}/units/layouts",
      method: "get",
      description: "Get all unit layouts",
      params: UnitLayoutsTableParamsSchema,
      response: UnitLayoutsResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/layouts",
      method: "post",
      description: "Create a unit layout",
      body: UnitLayoutsCreateBodySchema,
      response: UnitLayoutsCreateResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/layouts/{layoutId}",
      method: "post",
      description: "Update a unit layout",
      body: UnitLayoutsCreateBodySchema,
      response: UnitLayoutsCreateResponseSchema,
    },
    {
      path: "/projects/{projectId}/units/layouts/{layoutId}",
      method: "get",
      description: "Get a unit layout",
      response: UnitLayoutsResponseSchema,
    },
  ],
);
