import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export const UnitsetsResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  layout: z.string(),
});
export const UnitsetColumnSchema = z.object({
  column: z.string(),
});

export const UnitsetDeleteBodySchema = z.object({
  ids: z.array(z.number()),
});

export const UnitsetResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  units: z.number(),
  columns: z.array(UnitsetColumnSchema),
  layoutId: z.number(),
  layout: z.string(),
});

export const UnitsetsCreateBodySchema = z.object({
  name: z.string(),
  unitIds: z.array(z.string()),
  method: z.enum(["append", "replace", "delete"]),
  layout: z.string().optional(),
});

export const UnitsetsUpdateBodySchema = z.object({
  name: z.string().optional(),
  layout: z.string().optional(),
});

export const UnitsetTableParamsSchema = createTableParamsSchema({ maxPageSize: 1000 });

export const UnitsetUnitsUpdateSchema = z.object({
  id: z.number(),
  unitIds: z.array(z.string()),
  method: z.enum(["append", "replace", "delete"]),
});
