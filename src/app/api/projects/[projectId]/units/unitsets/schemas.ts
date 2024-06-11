import { z } from "zod";

export const UnitsetsResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
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
  n: z.number(),
  units: z.number(),
  columns: z.array(UnitsetColumnSchema),
});

export const UnitsetsCreateBodySchema = z.object({
  name: z.string(),
  unitIds: z.array(z.string()),
});
