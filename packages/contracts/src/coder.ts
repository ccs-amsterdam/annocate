import { z } from "zod";
import { IdSchema } from "./common.js";
import { DeletionRequestSchema, DisplayChangeSchema, SessionEndSchema } from "./session.js";
import { VariableValueSchema } from "./variableValue.js";

/**
 * A coder's session with a progress summary, for `GET /coders`. A coder
 * annotates through a link; distinct from a "study user" (see study.ts).
 */
export const CoderProgressSchema = z.object({
  id: IdSchema,
  email: z.string().email().optional(),
  /** The coder id (`$session.coder`), e.g. a panel's participant id; a label, never a key (docs/coder-identity.md). */
  coder: z.string().optional(),
  /** The link the coder came in through. */
  linkId: IdSchema,
  linkLabel: z.string(),
  /** When the coder was created (first opened the link). */
  started: z.coerce.date(),
  /** Their latest answer; null if they haven't answered anything yet. */
  lastActive: z.coerce.date().nullable(),
  /** Live answers (unit-level variable values). */
  answers: z.number().int().nonnegative(),
  /** unit loop title (`loopTitle`) -> units this coder finished, for the loops of the live design version. */
  finished: z.record(z.string(), z.number().int().nonnegative()),
  /**
   * Deployed test units (`test_set`: overlap, gold, practice;
   * docs/architecture.md §6.2) the coder finished, of how many (empty
   * before the coder reached a loop).
   */
  special: z.partialRecord(
    z.enum(["overlap", "gold", "practice"]),
    z.object({ done: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  ),
  /** Coder-level values: answers outside unit loops, and drawn random conditions (experiments). */
  variables: z.record(z.string(), VariableValueSchema),
  /** Set if the coder's session ended at an `end` item (screened out or complete), or they quit. */
  ended: SessionEndSchema.nullable(),
  /** The session's values (`$session.<name>`): its coder id, URL parameters and linked random conditions. */
  session: z.record(z.string(), z.string()),
  /** Set if the coder asked for their answers to be deleted (until the researcher deletes their data). */
  deletionRequest: DeletionRequestSchema.nullable(),
  /** How their screen looked, and when it changed (keys, width class, theme; docs/client.md §4 "Display"). */
  display: z.array(DisplayChangeSchema),
});
export type CoderProgress = z.infer<typeof CoderProgressSchema>;

/**
 * Body for `POST /study/:studyId/coders/delete`: which coders' data to delete,
 * by session id, coder id or email (any combination; at least one). Deletes
 * the coders and all their answers, also reset ones, for good.
 */
export const DeleteCodersSchema = z
  .object({
    sessionIds: z.array(z.number().int().positive()).optional(),
    coders: z.array(z.string().min(1)).optional(),
    emails: z.array(z.string().min(1)).optional(),
  })
  .refine((d) => (d.sessionIds?.length ?? 0) + (d.coders?.length ?? 0) + (d.emails?.length ?? 0) > 0, {
    message: "Name at least one session id, coder id or email",
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
 * deployed design version's who codes: a link per coder, a link
 * per set of a crowd's column, or one link (docs/architecture.md §7). Their
 * settings are the design's; the researcher can revoke a link, reopen it,
 * or give it a new secret.
 */
export const LinkResponseSchema = z.object({
  /** What the link is for: its values, or "Open link". */
  label: z.string(),
  /** The most sessions it starts (a crowd's most coders, per link), from the deployed design. */
  maxUses: z.number().int().positive().optional(),
  id: IdSchema,
  studyId: IdSchema,
  /** Opaque secret used to build the link URL; not the same as a coder session token. */
  secret: z.string(),
  /** Number of coders created from this link so far. */
  uses: z.number().int().nonnegative(),
  created: z.coerce.date(),
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

/**
 * `GET /study/:studyId/coders/units`: per coder id, the units their
 * sessions answered (`coded`: they stay with the coder when redistributing
 * or moving units), and the ones they were sent but didn't answer (`served`:
 * prefetched, or on their screen now).
 */
export const CoderUnitsSchema = z.object({
  coders: z.array(z.object({ coder: z.string(), coded: z.array(IdSchema), served: z.array(IdSchema) })),
});
export type CoderUnits = z.infer<typeof CoderUnitsSchema>;
