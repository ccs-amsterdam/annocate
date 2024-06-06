import { z } from "zod";

export const UnitsetsResponseSchema = z.object({
  unitset: z.string(),
  count: z.number(),
});

export const UnitsetsCreateBodySchema = z.object({
  name: z.string(),
  unitIds: z.array(z.string()),
});
