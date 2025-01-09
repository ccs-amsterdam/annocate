import { z } from "zod";

export const PreviewUnitParamsSchema = z.object({
  jobSetId: z.coerce.number(),
  position: z.coerce.number(),
});
