import { z } from "zod";
import { IdSchema } from "../common.js";
import { UnitsSpecSchema } from "../unitFields.js";
import { SessionSpecSchema, type SessionSpec } from "./session.js";
import { TopLevelItemSchema, type TopLevelItem } from "./item.js";
import { semanticIssues } from "./validation.js";

/** A codebook's items. */
export const DesignItemsSchema = z
  .array(TopLevelItemSchema)
  .min(1, "A codebook needs at least one item")
  .superRefine((items, ctx) => {
    // The item schemas report their own issues; add the rest.
    for (const issue of semanticIssues(items).filter((i) => !i.warning)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

/**
 * A draft's items: any list. Drafts may be
 * saved while they don't pass validation (work in progress); a codebook is
 * only checked in full (`DesignItemsSchema`) to deploy or preview it.
 */
export const DraftItemsSchema = z.array(z.unknown()).max(10_000);

/**
 * Body for `POST /design` and `PUT /design/:id` -- always the full document.
 * Versions are identified by their order of creation, not by name.
 */
export const DesignWriteSchema = z.object({
  /** What changed in this version, e.g. "Added a sentiment question". */
  note: z.string().max(1000).optional(),
  items: DraftItemsSchema,
  /**
   * The unit fields (docs/plans/design.md §3). Left out: kept as they are
   * (uploads keep them up to date).
   */
  units: UnitsSpecSchema.optional(),
  /**
   * The session (docs/plans/design.md §2): URL and link parameters, the
   * participant id, link combinations. Null or absent: none. Not an item:
   * `items` can't hold a Session item.
   */
  session: SessionSpecSchema.nullable().optional(),
  /**
   * `PUT` only: the revision the edits are based on. If the draft was saved
   * since (by someone else), the server answers 409 `design_conflict`
   * instead of overwriting it. Leave out to overwrite regardless.
   */
  revision: z.number().int().positive().optional(),
});
export type DesignWrite = z.input<typeof DesignWriteSchema>;

/** A design version's metadata, e.g. for `GET /design`. */
export const DesignVersionMetaSchema = z.object({
  id: IdSchema,
  note: z.string().nullable(),
  created: z.coerce.date(),
  /** Last saved, and by whom (null: unknown). */
  updated: z.coerce.date(),
  updatedBy: z.string().nullable(),
  /** Bumped on every save: what `revision` in a write refers to. */
  revision: z.number().int().positive(),
  /** Once true, the codebook can no longer be edited/deleted (CONTRACTS.md). */
  immutable: z.boolean(),
  /** Whether it passes validation: required to deploy or preview it. */
  valid: z.boolean(),
});
export type DesignVersionMeta = z.infer<typeof DesignVersionMetaSchema>;

/** Full codebook document as returned by the server. A draft's items may not pass validation (`valid`). */
export const DesignVersionSchema = DesignVersionMetaSchema.extend({
  jobId: IdSchema,
  items: z.custom<TopLevelItem[]>((v) => Array.isArray(v)),
  units: UnitsSpecSchema,
  session: z.custom<SessionSpec | null>((v) => v === null || typeof v === "object"),
});
export type DesignVersion = z.infer<typeof DesignVersionSchema>;

/**
 * The 409 body of a `PUT /design/:id` whose `revision` is out of date:
 * someone saved the draft since. The client offers to overwrite it or to
 * load the saved version.
 */
export const DesignConflictSchema = z.object({
  error: z.string(),
  code: z.literal("design_conflict"),
  updated: z.coerce.date(),
  updatedBy: z.string().nullable(),
  revision: z.number().int().positive(),
});
export type DesignConflict = z.infer<typeof DesignConflictSchema>;
