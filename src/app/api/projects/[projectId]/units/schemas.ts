import { TableParamsSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export const UnitDataValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const UnitDataRowSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), UnitDataValueSchema),
});

export const UnitDataTableParamsSchema = TableParamsSchema.extend({
  unitsets: z.array(z.string()).optional(),
});

export const UnitDataResponseSchema = z.object({
  id: z.string(),
  unitsets: z.array(z.string()),
  data: z.record(z.string(), UnitDataValueSchema),
});

export const UnitDataCreateBodySchema = z.object({
  overwrite: z.boolean().optional(),
  units: z.array(UnitDataRowSchema).max(200),
});

export const UnitDataCreateResponseSchema = z.object({
  id: z.string(),
});
