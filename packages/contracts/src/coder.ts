import { z } from "zod";
import { IdSchema } from "./common.js";
import { isEmail, type Invite } from "./design/session.js";
import { ListQuerySchema, listResponse } from "./paging.js";
import { DeletionRequestSchema, DisplayChangeSchema, SessionEndSchema } from "./session.js";
import { VariableValueSchema } from "./variableValue.js";

/**
 * A coder's session with a progress summary, for `GET /sessions`. A coder
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
  /** Per unit loop of the live design version (in design order): the units this coder finished in it. */
  finished: z.array(
    z.object({
      /** The loop's id. */
      loop: z.string(),
      /** How the loop is called (`loopTitle`): its label, or else its id. */
      title: z.string(),
      units: z.number().int().nonnegative(),
    }),
  ),
  /**
   * Deployed test units (`test_set`: overlap, gold, practice;
   * docs/architecture.md §6.2) the coder finished, of how many (empty
   * before the coder reached a loop).
   */
  testUnits: z.partialRecord(
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

// The study's coders (docs/coder-identity.md §2): expert coders, made by the
// researchers, and a crowd's coders, made when a session with a new coder id
// starts. A coder id is per study and never changes; ids that differ only in
// case are the same coder.

/** Who a coder is: one of the researchers' expert coders, or a coder of a crowd. */
export const CoderKindSchema = z.enum(["expert", "crowd"]);
export type CoderKind = z.infer<typeof CoderKindSchema>;

/** The longest id of an expert coder. */
export const MAX_CODER_ID = 64;

/**
 * Why a text can't be an expert coder's id, or null if it can: 1 to 64
 * characters, no spaces at its ends, no control characters, and no `;` or
 * `#` (the id is a value of the units' `coder_set` column, whose cells use
 * them). A name, a number or an email address all fit.
 */
export function coderIdProblem(id: string): string | null {
  if (id.length === 0) return "A coder id can't be empty";
  if (id.length > MAX_CODER_ID) return `A coder id has at most ${MAX_CODER_ID} characters`;
  if (id.trim() !== id) return "A coder id has no spaces at its ends";
  if (/\p{Cc}/u.test(id)) return "A coder id has no control characters (tabs, line breaks)";
  if (/[;#]/.test(id)) return "A coder id has no ; or #";
  return null;
}

/** An expert coder's id (`coderIdProblem`). */
export const CoderIdSchema = z.string().superRefine((id, ctx) => {
  const problem = coderIdProblem(id);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

/** A coder's email address, to sign in with. */
export const CoderEmailSchema = z.string().max(254).refine(isEmail, "Not an email address");

/**
 * The ids given more than once, ignoring case (each once, as first
 * repeated): among `ids` themselves, or against the ids `existing` has.
 */
export function duplicateCoders(ids: readonly string[], existing: readonly string[] = []): string[] {
  const seen = new Set(existing.map((id) => id.toLowerCase()));
  const twice = new Map<string, string>();
  for (const id of ids) {
    const key = id.toLowerCase();
    if (seen.has(key) && !twice.has(key)) twice.set(key, id);
    seen.add(key);
  }
  return [...twice.values()];
}

/** The names that aren't one of the expert coders (an id is matched as written), each once. */
export function unknownCoders(names: readonly string[], experts: readonly string[]): string[] {
  const known = new Set(experts);
  return [...new Set(names)].filter((name) => !known.has(name));
}

/** Coders in a message: at most ten by id, then how many more. */
export function listedCoders(ids: readonly string[]): string {
  const shown = ids.slice(0, 10).join(", ");
  return ids.length > 10 ? `${shown} and ${ids.length - 10} more` : shown;
}

/**
 * What the invitation asks of the expert coders who have units (the
 * `coder_set` about to be deployed). Where coders sign in (`link:
 * "login"`), each needs an email address: an error naming those without.
 * Where coders pick their name (`pick_name`), the ids are shown to anyone
 * with the link: a warning if they look like email addresses.
 */
export function coderInviteChecks(
  invite: Invite | null,
  assigned: readonly { coder: string; email: string | null }[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (invite?.mode !== "coders") return { errors, warnings };
  const noEmail = assigned.filter((c) => !c.email).map((c) => c.coder);
  if (invite.link === "login" && noEmail.length > 0)
    errors.push(
      `Coders sign in with their email address, but ${noEmail.length === 1 ? "this coder has" : "these coders have"} none: ${listedCoders(noEmail)}. Give them an email address (Coders), or give each coder a link.`,
    );
  const addresses = assigned.filter((c) => isEmail(c.coder)).map((c) => c.coder);
  if (invite.link === "pick_name" && addresses.length > 0)
    warnings.push(
      `Coders pick their name from a list that anyone with the link sees, and ${addresses.length === 1 ? "this coder id looks" : "these coder ids look"} like an email address: ${listedCoders(addresses)}.`,
    );
  return { errors, warnings };
}

/**
 * A coder of the study (`GET /study/:studyId/coders`), with their units.
 * Expert coders: `assigned`, the units of their set in the deployed
 * `coder_set`, and `assignedDraft`, in the draft's (`draftDiffers`: not the
 * same units; deploying the units applies the draft); `remaining`: the
 * deployed ones they haven't answered. A crowd's coders have no units of
 * their own: null. `done`: the units their sessions answered.
 */
export const CoderResponseSchema = z.object({
  /** A number for the list's pages (`after`); the coder is known by `coder`. */
  id: IdSchema,
  coder: z.string(),
  kind: CoderKindSchema,
  /** The address an expert coder signs in with, if the researchers gave one. */
  email: z.string().nullable(),
  created: z.coerce.date(),
  assigned: z.number().int().nonnegative().nullable(),
  assignedDraft: z.number().int().nonnegative().nullable(),
  draftDiffers: z.boolean(),
  done: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative().nullable(),
  /** How many sessions they started. */
  sessions: z.number().int().nonnegative(),
  /** Their latest answer; null if they haven't answered anything yet. */
  lastActive: z.coerce.date().nullable(),
});
export type CoderResponse = z.infer<typeof CoderResponseSchema>;

/**
 * Units no expert coder has (test units aside): of the deployed units
 * (`live`; null before the first deploy), e.g. after a coder was deleted,
 * and of the draft.
 */
export const UnassignedUnitsSchema = z.object({
  live: z.number().int().nonnegative().nullable(),
  draft: z.number().int().nonnegative(),
});
export type UnassignedUnits = z.infer<typeof UnassignedUnitsSchema>;

/** `GET /study/:studyId/coders`: a page of the coders, and the units no expert coder has. */
export const CoderListSchema = listResponse("coders", CoderResponseSchema).extend({
  unassigned: UnassignedUnitsSchema,
});
export type CoderList = z.infer<typeof CoderListSchema>;

/** The query of `GET /study/:studyId/coders`: a list's, and optionally one kind of coder. */
export const CodersQuerySchema = ListQuerySchema.extend({ kind: CoderKindSchema.optional() });

/** The most expert coders one request creates. */
export const MAX_CODERS_PER_REQUEST = 5000;

/** Body of `POST /study/:studyId/coders`: expert coders to create, each with an email address or without. */
export const CodersCreateSchema = z.object({
  coders: z
    .array(z.object({ coder: CoderIdSchema, email: CoderEmailSchema.optional() }))
    .min(1)
    .max(MAX_CODERS_PER_REQUEST),
});
export type CodersCreate = z.infer<typeof CodersCreateSchema>;

/** Response of `POST /study/:studyId/coders`: the coders created. */
export const CodersCreatedSchema = z.object({ coders: z.array(CoderResponseSchema) });
export type CodersCreated = z.infer<typeof CodersCreatedSchema>;

/** Body of `PATCH /study/:studyId/coders/:coder`: the coder's email address (null: none). */
export const CoderPatchSchema = z.object({ email: CoderEmailSchema.nullable() });
export type CoderPatch = z.infer<typeof CoderPatchSchema>;

/**
 * Body for `POST /study/:studyId/coders/delete`: which coders to delete, by
 * session id, coder id or email (any combination; at least one). Deletes the
 * sessions and all their answers, also reset ones, for good. By coder id (or
 * a coder's email address) the coder goes too: their row, every session, and
 * their units in the draft and the deployed `coder_set`.
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

/** Response of `POST /study/:studyId/coders/delete`: the sessions deleted, how many answers they had, and the coders that are gone. */
export const DeleteCodersResponseSchema = z.object({
  sessionIds: z.array(z.number().int().positive()),
  answers: z.number().int().nonnegative(),
  coders: z.array(z.string()),
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
