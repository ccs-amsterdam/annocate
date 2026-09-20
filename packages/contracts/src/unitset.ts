import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * A named selection of a job's units (design plan §2), referenced
 * by a codebook's `unit_loop` items by name. Unit order/randomization
 * is configured directly in the codebook's `unit_loop` item.
 */
export const UnitsetWriteSchema = z.object({
  name: z.string().min(1).max(128),
  unitIds: z.array(IdSchema),
});
export type UnitsetWrite = z.infer<typeof UnitsetWriteSchema>;

export const UnitsetResponseSchema = UnitsetWriteSchema.extend({
  id: IdSchema,
  jobId: IdSchema,
});
export type UnitsetResponse = z.infer<typeof UnitsetResponseSchema>;
