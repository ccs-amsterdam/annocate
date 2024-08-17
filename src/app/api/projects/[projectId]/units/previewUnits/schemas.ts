import { z } from "zod";

export const PreviewUnitsParamsSchema = z.object({
  blockId: z.coerce.number().optional(),
});

export const PreviewUnitsResponseSchema = z.array(z.string());
