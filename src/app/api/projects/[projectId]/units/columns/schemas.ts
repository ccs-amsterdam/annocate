import exp from "constants";
import { z } from "zod";

export const UnitColumnsResponseSchema = z.object({
  column: z.string(),
});

export const UnitsetColumnSchema = z.object({
  column: z.string(),
});

export const UnitColumnsParamSchema = z.object({
  unitsetId: z.number().optional(),
});
