import { z } from "zod";
import { IdSchema } from "./common.js";
import { DeletionRequestSchema, DisplayChangeSchema, SessionEndSchema } from "./session.js";
import { VariableValueSchema } from "./variableValue.js";

/**
 * A coder: someone annotating a study via a link/access link. Distinct from
 * a "study user" (see study.ts). Study-scoped identity (CONTRACTS.md).
 */
export const CoderResponseSchema = z.object({
  id: IdSchema,
  studyId: IdSchema,
  /** Present if the coder authenticated (e.g. via a link that requires a login); absent for fully anonymous coders. */
  email: z.string().email().optional(),
  variables: z.record(z.string(), VariableValueSchema),
});
export type CoderResponse = z.infer<typeof CoderResponseSchema>;

/** Manager-facing listing entry: coder + progress summary, for `GET /coders`. */
export const CoderProgressSchema = z.object({
  id: IdSchema,
  email: z.string().email().optional(),
  /** External label (e.g. a panel company's participant id); see docs/coder-identity.md. */
  coder: z.string().optional(),
  /** The link the coder came in through; null for coders from before this was recorded. */
  linkId: IdSchema.nullable(),
  linkLabel: z.string().nullable(),
  /** When the coder was created (first opened the link); null if unknown. */
  started: z.coerce.date().nullable(),
  /** Their latest answer; null if they haven't answered anything yet. */
  lastActive: z.coerce.date().nullable(),
  /** Live answers (unit-level variable values). */
  answers: z.number().int().nonnegative(),
  /** unit loop title (`loopTitle`) -> units this coder finished, for the loops of the live design version. */
  finished: z.record(z.string(), z.number().int().nonnegative()),
  /**
   * Units of the deployed special sets (`_overlap`, `_gold`, `_practice`;
   * docs/architecture.md §6.2) the coder finished, of how many: the
   * special sets of the set groups the coder was routed to (empty before
   * routing, or in loops without a group).
   */
  special: z.partialRecord(
    z.enum(["overlap", "gold", "practice"]),
    z.object({ done: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  ),
  /** Coder-level values: answers outside unit loops, and `auto` variables (link presets, random, URL). */
  variables: z.record(z.string(), VariableValueSchema),
  /** Set if the coder's session ended at an `end` item (screened out or complete), or they quit. */
  ended: SessionEndSchema.nullable(),
  /** The session's values: the URL parameters its link required, by their `$session` name. */
  session: z.record(z.string(), z.string()),
  /** Set if the coder asked for their answers to be deleted (until the researcher deletes their data). */
  deletionRequest: DeletionRequestSchema.nullable(),
  /** How their screen looked, and when it changed (keys, width class, theme; docs/client.md §4 "Display"). */
  display: z.array(DisplayChangeSchema),
});
export type CoderProgress = z.infer<typeof CoderProgressSchema>;

/**
 * Body for `POST /study/:studyId/coders/delete`: which coders' data to delete,
 * by id, participant id or email (any combination; at least one). Deletes
 * the coders and all their answers, also reset ones, for good.
 */
export const DeleteCodersSchema = z
  .object({
    sessionIds: z.array(z.number().int().positive()).optional(),
    coders: z.array(z.string().min(1)).optional(),
    emails: z.array(z.string().min(1)).optional(),
  })
  .refine((d) => (d.sessionIds?.length ?? 0) + (d.coders?.length ?? 0) + (d.emails?.length ?? 0) > 0, {
    message: "Name at least one coder id, participant id or email",
  });
export type DeleteCoders = z.infer<typeof DeleteCodersSchema>;

/** Response of `POST /study/:studyId/coders/delete`: the coders deleted, and how many answers they had. */
export const DeleteCodersResponseSchema = z.object({
  sessionIds: z.array(z.number().int().positive()),
  answers: z.number().int().nonnegative(),
});
export type DeleteCodersResponse = z.infer<typeof DeleteCodersResponseSchema>;

/**
 * A deleted coder, from the study's deletion log (`GET /study/:studyId/coders/deletions`).
 * Kept after the data is gone, so researchers can delete the same coder from
 * results they downloaded earlier: it has the identifiers those results use.
 */
export const CoderDeletionSchema = z.object({
  sessionId: z.number().int().positive(),
  coder: z.string().nullable(),
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
 * A link (docs/coder-identity.md §3). Links are generated from the
 * deployed design version's coder invitation: a link per coder, or one link
 * (docs/architecture.md §7). The researcher manages who may use a link, not
 * which links exist.
 */
export const LinkWriteSchema = z.object({
  label: z.string().min(1).max(128),
  /** A participant id fixed on this link (e.g. a personal link). A label, never a credential. */
  coder: z.string().min(1).max(256).optional(),
  /** Stop accepting new coders after this many. */
  maxUses: z.number().int().positive().optional(),
});
export type LinkWrite = z.input<typeof LinkWriteSchema>;

export const LinkResponseSchema = LinkWriteSchema.extend({
  id: IdSchema,
  studyId: IdSchema,
  /** Opaque secret used to build the link URL; not the same as a coder session token. */
  secret: z.string(),
  /** Number of coders created from this link so far. */
  uses: z.number().int().nonnegative(),
  /** Null for links from before this was recorded. */
  created: z.coerce.date().nullable(),
  /**
   * Set once revoked (`POST /links/:id/revoke`): no new coders. Coders who
   * already started keep working. A link can only be deleted while unused.
   */
  revokedAt: z.coerce.date().nullable(),
  /** The values this link carries: a link per coder, its coder (`$session.coder`). */
  params: z.record(z.string(), z.string()),
  /**
   * Set when the deployed design version no longer makes this link (e.g. its set
   * was removed): no new coders ("This link is no longer active"). Cleared
   * if the link is part of the design again.
   */
  retiredAt: z.coerce.date().nullable(),
});
export type LinkResponse = z.infer<typeof LinkResponseSchema>;
