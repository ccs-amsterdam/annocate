import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export const UnitDataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const UnitDataSchema = z.record(z.string(), UnitDataValueSchema);

export const UnitDataRowSchema = z.object({
  id: z.string(),
  data: UnitDataSchema,
});

export const UnitDataTableParamsSchema = createTableParamsSchema({});

export const UnitDataDeleteBodySchema = z.object({
  ids: z.array(z.string()),
});

export const UnitDataResponseSchema = z.object({
  id: z.number(),
  externalId: z.string(),
  data: UnitDataSchema,
});

export const UnitDataCreateBodySchema = z.object({
  overwrite: z.boolean().optional(),
  units: z.array(UnitDataRowSchema).max(200),
});

export const UnitDataCreateResponseSchema = z.object({
  id: z.string(),
});
