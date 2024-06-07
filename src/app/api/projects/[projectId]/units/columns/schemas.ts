import { z } from "zod";

export const UnitColumnsResponseSchema = z.object({
  column: z.string(),
});

export const UnitColumnsParamSchema = z.object({
  unitsets: z.array(z.string()).optional(),
});
