import { z } from "zod";

export const UnitsGetParamsSchema = z.object({
  unitId: z.string().optional(),
  blockId: z.number().optional(),
  position: z.number().optional(),
});
