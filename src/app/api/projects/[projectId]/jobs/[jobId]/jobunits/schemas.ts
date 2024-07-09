import { z } from "zod";

export const JobUnitsUpdateSchema = z.object({
  id: z.number(),
  unitIds: z.array(z.string()).max(10000),
  append: z.boolean(),
});
