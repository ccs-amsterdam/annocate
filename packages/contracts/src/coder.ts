import { z } from "zod";
import { IdSchema } from "./common.js";
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
  /** The session's values: the URL parameters its invitation required, by their `$session` name. */
  session: z.record(z.string(), z.string()),
  /** Set if the coder asked for their answers to be deleted (until the researcher deletes their data). */
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
 * A deleted coder, from the job's deletion log (`GET /job/:jobId/coders/deletions`).
 * Kept after the data is gone, so researchers can delete the same coder from
 * results they downloaded earlier: it has the identifiers those results use.
 */
export const CoderDeletionSchema = z.object({
  coderId: z.number().int().positive(),
  participantId: z.string().nullable(),
  email: z.string().nullable(),
  /** When the coder asked for it, if they did. */
  requestedAt: z.coerce.date().nullable(),
  deletedAt: z.coerce.date(),
  /** The researcher who deleted it. */
  deletedBy: z.string().nullable(),
  /** How many answer rows were deleted. */
  answers: z.number().int().nonnegative(),
});
export type CoderDeletion = z.infer<typeof CoderDeletionSchema>;

/**
 * An invitation link (docs/coder-identity.md §3). Links are generated from
 * the published codebook: one per combination of its link parameters
 * (docs/plans/sets-and-session-parameters.md §4). The researcher manages
 * who may use a link, not which links exist.
 */
export const CoderInviteWriteSchema = z.object({
  label: z.string().min(1).max(128),
  /**
   * `none`: no login; work stays on the device unless transferred.
   * `optional`: coders may log in to resume elsewhere. `required`: login first.
   */
  auth: z.enum(["none", "optional", "required"]).default("none"),
  /** A participant id fixed on this link (e.g. a personal link). A label, never a credential. */
  participantId: z.string().min(1).max(256).optional(),
  /**
   * Restrict the link to these email addresses: coders log in, and only
   * these logins are let in. Stored on the server only; never part of the
   * codebook.
   */
  emails: z.array(z.string().email()).optional(),
  /** Stop accepting new coders after this many. */
  maxUses: z.number().int().positive().optional(),
});
export type CoderInviteWrite = z.input<typeof CoderInviteWriteSchema>;

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
  /** The link parameter values this link carries (`$session.<name>`). */
  params: z.record(z.string(), z.string()),
  /**
   * Set when the published codebook no longer makes this link (e.g. its set
   * was removed): no new coders ("This link is no longer active"). Cleared
   * if the link is part of the design again.
   */
  retiredAt: z.coerce.date().nullable(),
});
export type CoderInviteResponse = z.infer<typeof CoderInviteResponseSchema>;
