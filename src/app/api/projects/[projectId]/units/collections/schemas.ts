import { z } from "zod";

export const UnitCollectionsResponseSchema = z.object({
  collection: z.string(),
  count: z.number(),
});
