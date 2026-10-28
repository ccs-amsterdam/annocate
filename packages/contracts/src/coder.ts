import { z } from "zod";
import { IdSchema, SafeNameSchema } from "./common.js";
import { DeletionRequestSchema, SessionEndSchema } from "./session.js";
import { VariableValueSchema } from "./variableValue.js";

/**
 * A coder: someone annotating a job via an invite/access link. Distinct from
 * a "job user" (see job.ts). Job-scoped identity (CONTRACTS.md).
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
  /** The invite the coder came in through; null for coders from before this was recorded. */
  inviteId: IdSchema.nullable(),
  inviteLabel: z.string().nullable(),
  /** When the coder was created (first opened the invite); null if unknown. */
  started: z.coerce.date().nullable(),
  /** Their latest answer; null if they haven't answered anything yet. */
  lastActive: z.coerce.date().nullable(),
  /** Live answers (unit-level variable values). */
  answers: z.number().int().nonnegative(),
  /** unit loop title (`loopTitle`) -> units this coder finished, for the loops of the live codebook. */
  finished: z.record(z.string(), z.number().int().nonnegative()),
  /** Coder-level values: answers outside unit loops, and `auto` variables (invite presets, random, URL). */
  variables: z.record(z.string(), VariableValueSchema),
  /** Set if the coder's session ended at an `end` item (screened out or complete), or they quit. */
  ended: SessionEndSchema.nullable(),
  /** Set if the coder asked for their answers to be deleted (open until the researcher deletes them or declines). */
  deletionRequest: DeletionRequestSchema.nullable(),
});
export type CoderProgress = z.infer<typeof CoderProgressSchema>;

/**
 * Body for `POST /job/:jobId/coders/delete`: which coders' data to delete,
 * by id, participant id or email (any combination; at least one). Deletes
 * the coders and all their answers, also reset ones, for good.
 */
export const DeleteCodersSchema = z
  .object({
    coderIds: z.array(z.number().int().positive()).optional(),
    participantIds: z.array(z.string().min(1)).optional(),
    emails: z.array(z.string().min(1)).optional(),
  })
  .refine((d) => (d.coderIds?.length ?? 0) + (d.participantIds?.length ?? 0) + (d.emails?.length ?? 0) > 0, {
    message: "Name at least one coder id, participant id or email",
  });
export type DeleteCoders = z.infer<typeof DeleteCodersSchema>;

/** Response of `POST /job/:jobId/coders/delete`: the coders deleted, and how many answers they had. */
export const DeleteCodersResponseSchema = z.object({
  coderIds: z.array(z.number().int().positive()),
  answers: z.number().int().nonnegative(),
});
export type DeleteCodersResponse = z.infer<typeof DeleteCodersResponseSchema>;

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
   * the server only; never part of the codebook. Not enforced yet: there is
   * no email authentication.
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
  /**
   * The unitset coders of this invite code in unit loops with
   * `mode: "invitation"` (e.g. made by dividing units over coders). Null:
   * none, so they get no units there.
   */
  unitsetId: IdSchema.nullable().optional(),
});
export type CoderInviteWrite = z.infer<typeof CoderInviteWriteSchema>;

export const CoderInviteResponseSchema = CoderInviteWriteSchema.extend({
  id: IdSchema,
  jobId: IdSchema,
  /** Opaque secret used to build the invite URL; not the same as a coder session token. */
  secret: z.string(),
  /** Number of coders created from this invite so far. */
  uses: z.number().int().nonnegative(),
  /** Null for invites from before this was recorded. */
  created: z.coerce.date().nullable(),
  /**
   * Set once revoked (`POST /invites/:id/revoke`): no new coders. Coders who
   * already started keep working. An invite can only be deleted while unused.
   */
  revokedAt: z.coerce.date().nullable(),
});
export type CoderInviteResponse = z.infer<typeof CoderInviteResponseSchema>;
