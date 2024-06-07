import { z } from "zod";

export const PreviewParamsSchema = z.object({
  layout: z.string(),
  index: z.number(),
});
