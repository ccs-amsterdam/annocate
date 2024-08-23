import { z } from "zod";

export const PreviewUnitParamsSchema = z.object({
  blockId: z.coerce.number().optional(),
  position: z.coerce.number(),
});
