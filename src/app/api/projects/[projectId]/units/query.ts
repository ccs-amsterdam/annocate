import { z } from "zod";
import {
  UnitDataCreateBodySchema,
  UnitDataCreateResponseSchema,
  UnitDataDeleteBodySchema,
  UnitDataResponseSchema,
  UnitDataTableParamsSchema,
} from "./data/schemas";
import { useGet, useMutate, useTableGet } from "@/app/api/queryHelpers";
import { createOpenAPIDefinitions } from "@/app/api/openapiHelpers";
import {
  UnitsetDeleteBodySchema,
  UnitsetResponseSchema,
  UnitsetsResponseSchema,
  UnitsetsUpdateBodySchema,
  UnitsetTableParamsSchema,
} from "./unitsets/schemas";
import {
  UnitLayoutResponseSchema,
  UnitLayoutsCreateBodySchema,
  UnitLayoutsCreateResponseSchema,
  UnitLayoutsResponseSchema,
  UnitLayoutsTableParamsSchema,
} from "./layouts/schemas";
import { IdResponseSchema } from "@/app/api/schemaHelpers";

export function useUnits(projectId: number, initialParams: z.input<typeof UnitDataTableParamsSchema>) {
  return useTableGet({
    resource: "unit",
    endpoint: `projects/${projectId}/units/data`,

    initialParams,
    responseSchema: UnitDataResponseSchema,
  });
}

export function useCreateUnits(projectId: number) {
  return useMutate({
    method: "post",
    resource: "unit",
    endpoint: `projects/${projectId}/units/data`,
    bodySchema: UnitDataCreateBodySchema,
    responseSchema: IdResponseSchema,
    invalidateResources: ["unitset"],
  });
}

export function useUnitsets(projectId: number, initialParams: z.input<typeof UnitsetTableParamsSchema>) {
  return useTableGet({
    resource: "unitset",
    endpoint: `projects/${projectId}/units/unitsets`,
    initialParams,
    responseSchema: UnitsetsResponseSchema,
  });
}

export function useDeleteUnits(projectId: number) {
  return useMutate({
    method: "post",
    resource: "unit",
    endpoint: `projects/${projectId}/units/data/delete`,
    bodySchema: UnitDataDeleteBodySchema,
    responseSchema: IdResponseSchema,
    invalidateResources: ["unitset"],
  });
}

export function useDeleteUnitsets(projectId: number) {
  return useMutate({
    method: "post",
    resource: "unitset",
    endpoint: `projects/${projectId}/units/unitsets/delete`,
    bodySchema: UnitsetDeleteBodySchema,
    responseSchema: IdResponseSchema,
    invalidateResources: ["unit"],
  });
}

export function useUnitset(projectid: number, unitsetid: number | undefined) {
  return useGet({
    resource: "unitset",
    endpoint: `projects/${projectid}/units/unitsets/${unitsetid}`,
    responseSchema: UnitsetResponseSchema,
    disabled: unitsetid === undefined,
  });
}

export function useUpdateUnitset(projectId: number, unitsetid: number) {
  return useMutate({
    method: "post",
    resource: "unitset",
    endpoint: `projects/${projectId}/units/unitsets/${unitsetid}`,
    bodySchema: UnitsetsUpdateBodySchema,
    responseSchema: IdResponseSchema,
    // invalidateResources: ["unit"],
  });
}

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
