import { z } from "zod";

export const UnitsetsResponseSchema = z.object({
  name: z.string(),
  count: z.number(),
});

export const UnitsetResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  units: z.array(z.string()),
});

export const UnitsetsCreateBodySchema = z.object({
  name: z.string(),
  unitIds: z.array(z.string()),
});
