import { z } from "zod";
import { IdSchema, RoleSchema } from "./common";

/** A "job", the sole top-level entity in the new data model (design plan §2). */
export const JobWriteSchema = z.object({
  name: z.string().min(1).max(256),
  archived: z.boolean().optional().default(false),
});
export type JobWrite = z.infer<typeof JobWriteSchema>;

export const JobResponseSchema = JobWriteSchema.extend({
  id: IdSchema,
  created: z.coerce.date(),
});
export type JobResponse = z.infer<typeof JobResponseSchema>;

/**
 * A "job user" manages the job (create/edit codebooks, units, invite
 * coders, ...). Distinct from a "coder", who annotates via an invite/access
 * link (see coder.ts). Whole-resource replace via `PUT /job/:id/users`.
 */
export const JobUserSchema = z.object({
  email: z.string().email(),
  role: RoleSchema,
});
export type JobUser = z.infer<typeof JobUserSchema>;

export const JobUsersWriteSchema = z.object({
  users: z.array(JobUserSchema),
});
