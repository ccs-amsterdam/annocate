import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export const UnitDataValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const UnitDataRowSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), UnitDataValueSchema),
});

export const UnitDataTableParamsSchema = createTableParamsSchema({});

// ids or unitsetIds is XOR
export const UnitDataDeleteBodySchema = z.object({
  ids: z.array(z.string()).optional(),
  unitsetIds: z.array(z.number()).optional(),
});

export const UnitDataResponseSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), UnitDataValueSchema),
});

export const UnitDataCreateBodySchema = z.object({
  overwrite: z.boolean().optional(),
  units: z.array(UnitDataRowSchema).max(200),
  unitset: z.string(),
  layout: z.string().optional(),
});

export const UnitDataCreateResponseSchema = z.object({
  id: z.string(),
});
