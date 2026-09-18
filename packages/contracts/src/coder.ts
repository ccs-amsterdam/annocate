import { z } from "zod";
import { IdSchema } from "./common";
import { VariableValueSchema } from "./variableValue";

/**
 * A coder: someone annotating a job via an invite/access link. Distinct from
 * a "job user" (see job.ts). Job-scoped identity (design plan §2).
 */
export const CoderResponseSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  /** Present if the coder authenticated (e.g. via an email-linked invite); absent for fully anonymous coders. */
  email: z.string().email().optional(),
  variables: z.record(z.string(), VariableValueSchema),
});
export type CoderResponse = z.infer<typeof CoderResponseSchema>;

/** Manager-facing listing entry: coder + progress summary, for `GET /coders`. */
export const CoderProgressSchema = z.object({
  id: IdSchema,
  email: z.string().email().optional(),
  unitsDone: z.record(z.string(), z.number().int().nonnegative()), // unitset name -> count done
});

export const CoderInviteWriteSchema = z.object({
  label: z.string().min(1).max(128),
  access: z.enum(["only_authenticated", "only_anonymous", "user_decides"]),
});
export const CoderInviteResponseSchema = CoderInviteWriteSchema.extend({
  id: IdSchema,
  jobId: IdSchema,
  /** Opaque secret used to build the invite URL; not the same as a coder session token. */
  secret: z.string(),
});
