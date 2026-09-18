import { z } from "zod";
import { IdSchema } from "./common";

/**
 * A named, ordered selection of a job's units (design plan §2), referenced
 * by a codebook's `unit_loop` items by name. Replaces the old
 * jobSets/jobSetUnits tables.
 */
export const UnitsetOrderSchema = z.enum(["fixed", "random"]);

export const UnitsetWriteSchema = z.object({
  name: z.string().min(1).max(128),
  unitIds: z.array(IdSchema),
  order: UnitsetOrderSchema.default("fixed"),
});
export type UnitsetWrite = z.infer<typeof UnitsetWriteSchema>;

export const UnitsetResponseSchema = UnitsetWriteSchema.extend({
  id: IdSchema,
  jobId: IdSchema,
});
export type UnitsetResponse = z.infer<typeof UnitsetResponseSchema>;
