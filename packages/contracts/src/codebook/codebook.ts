import { z } from "zod";
import { IdSchema } from "../common.js";
import { TopLevelItemSchema } from "./item.js";
import { codebookErrors } from "./validation.js";

export const CodebookItemsSchema = z
  .array(TopLevelItemSchema)
  .min(1, "A codebook needs at least one item")
  .superRefine((items, ctx) => {
    for (const issue of codebookErrors(items)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
    }
  });

/**
 * Body for `POST /codebook` and `PUT /codebook/:id` -- always the full document.
 * Versions are identified by their order of creation, not by name.
 */
export const CodebookWriteSchema = z.object({
  /** What changed in this version, e.g. "Added a sentiment question". */
  note: z.string().max(1000).optional(),
  items: CodebookItemsSchema,
});
export type CodebookWrite = z.infer<typeof CodebookWriteSchema>;

/** Full codebook document as returned by the server. */
export const CodebookResponseSchema = CodebookWriteSchema.extend({
  note: z.string().nullable(),
  id: IdSchema,
  jobId: IdSchema,
  created: z.coerce.date(),
  /** Once true, the codebook can no longer be edited/deleted (CONTRACTS.md). */
  immutable: z.boolean(),
});
export type CodebookResponse = z.infer<typeof CodebookResponseSchema>;

/** Metadata-only listing, e.g. for `GET /codebook`. */
export const CodebookMetaSchema = z.object({
  id: IdSchema,
  note: z.string().nullable(),
  created: z.coerce.date(),
  immutable: z.boolean(),
});
export type CodebookMeta = z.infer<typeof CodebookMetaSchema>;
