import { z } from "zod";
import { IdSchema, SafeNameSchema } from "./common.js";
import { VariableValueSchema } from "./variableValue.js";

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
  /** External label (e.g. a panel company's participant id); see docs/coder-identity.md. */
  participantId: z.string().optional(),
  unitsDone: z.record(z.string(), z.number().int().nonnegative()), // unitset name -> count done
});
export type CoderProgress = z.infer<typeof CoderProgressSchema>;

/**
 * An invitation link (docs/coder-identity.md §3). Two independent settings:
 * whether coders must log in (`auth`), and whether coders get a participant
 * id (fixed on the invite, or from the `participant` URL param).
 */
export const CoderInviteWriteSchema = z.object({
  label: z.string().min(1).max(128),
  /**
   * `none`: no login; work stays on the device unless transferred.
   * `optional`: coders may log in to resume elsewhere. `required`: login first.
   * (Login is not implemented yet; `required` invites are refused for now.)
   */
  auth: z.enum(["none", "optional", "required"]).default("none"),
  /** A participant id fixed on this invite (e.g. a personal link). A label, never a credential. */
  participantId: z.string().min(1).max(256).optional(),
  /** Take the participant id from the `participant` URL param (e.g. survey/panel companies). */
  participantFromUrl: z.boolean().optional(),
  /**
   * Restrict the invite to these (authenticated) email addresses. Stored on
   * the db server only; never part of the codebook. Not enforced by the dev
   * mock server, which has no email authentication.
   */
  emails: z.array(z.string().email()).optional(),
  /** Stop accepting new coders after this many. */
  maxUses: z.number().int().positive().optional(),
  /**
   * Preset values for the codebook's `auto` variables with `source: "invite"`
   * (variable name -> code), e.g. `{ slot: "2" }`. This is how specific
   * coders are routed to specific unitsets without the codebook knowing who
   * they are.
   */
  variables: z.record(SafeNameSchema, z.string()).optional(),
});
export type CoderInviteWrite = z.infer<typeof CoderInviteWriteSchema>;

export const CoderInviteResponseSchema = CoderInviteWriteSchema.extend({
  id: IdSchema,
  jobId: IdSchema,
  /** Opaque secret used to build the invite URL; not the same as a coder session token. */
  secret: z.string(),
  /** Number of coders created from this invite so far. */
  uses: z.number().int().nonnegative(),
});
export type CoderInviteResponse = z.infer<typeof CoderInviteResponseSchema>;
