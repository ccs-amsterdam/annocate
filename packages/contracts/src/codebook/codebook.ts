import { z } from "zod";
import { IdSchema } from "../common.js";
import { TopLevelItemSchema, type TopLevelItem } from "./item.js";
import { migrateCodebookItems } from "./migrate.js";
import { semanticIssues } from "./validation.js";

/** A codebook's items; old codebooks are migrated on parse (migrate.ts). */
export const CodebookItemsSchema = z.preprocess(
  migrateCodebookItems,
  z
    .array(TopLevelItemSchema)
    .min(1, "A codebook needs at least one item")
    .superRefine((items, ctx) => {
      // The item schemas report their own issues; add the rest.
      for (const issue of semanticIssues(items).filter((i) => !i.warning)) {
        ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
      }
    }),
);

/**
 * A draft's items: any list, migrated from older shapes. Drafts may be
 * saved while they don't pass validation (work in progress); a codebook is
 * only checked in full (`CodebookItemsSchema`) to publish or preview it.
 */
export const DraftItemsSchema = z.preprocess(migrateCodebookItems, z.array(z.unknown()).max(10_000));

/**
 * Body for `POST /codebook` and `PUT /codebook/:id` -- always the full document.
 * Versions are identified by their order of creation, not by name.
 */
export const CodebookWriteSchema = z.object({
  /** What changed in this version, e.g. "Added a sentiment question". */
  note: z.string().max(1000).optional(),
  items: DraftItemsSchema,
  /**
   * `PUT` only: the revision the edits are based on. If the draft was saved
   * since (by someone else), the server answers 409 `codebook_conflict`
   * instead of overwriting it. Leave out to overwrite regardless.
   */
  revision: z.number().int().positive().optional(),
});
export type CodebookWrite = z.input<typeof CodebookWriteSchema>;

/** Codebook metadata, e.g. for `GET /codebook`. */
export const CodebookMetaSchema = z.object({
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
  /** Whether it passes validation: required to publish or preview it. */
  valid: z.boolean(),
});
export type CodebookMeta = z.infer<typeof CodebookMetaSchema>;

/** Full codebook document as returned by the server. A draft's items may not pass validation (`valid`). */
export const CodebookResponseSchema = CodebookMetaSchema.extend({
  jobId: IdSchema,
  items: z.custom<TopLevelItem[]>((v) => Array.isArray(v)),
});
export type CodebookResponse = z.infer<typeof CodebookResponseSchema>;

/**
 * The 409 body of a `PUT /codebook/:id` whose `revision` is out of date:
 * someone saved the draft since. The client offers to overwrite it or to
 * load the saved version.
 */
export const CodebookConflictSchema = z.object({
  error: z.string(),
  code: z.literal("codebook_conflict"),
  updated: z.coerce.date(),
  updatedBy: z.string().nullable(),
  revision: z.number().int().positive(),
});
export type CodebookConflict = z.infer<typeof CodebookConflictSchema>;
