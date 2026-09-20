import { z } from "zod";
import { IdSchema } from "../common.js";
import { TopLevelItemSchema } from "./item.js";
import { validateCodebookItems } from "./validation.js";

export const CodebookItemsSchema = z
  .array(TopLevelItemSchema)
  .min(1, "A codebook needs at least one item")
  .superRefine((items, ctx) => {
    for (const issue of validateCodebookItems(items)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
    }
  });

/** Body for `POST /codebook` and `PUT /codebook/:id` -- always the full document. */
export const CodebookWriteSchema = z.object({
  name: z.string().min(1).max(256),
  items: CodebookItemsSchema,
});
export type CodebookWrite = z.infer<typeof CodebookWriteSchema>;

/** Full codebook document as returned by the server. */
export const CodebookResponseSchema = CodebookWriteSchema.extend({
  id: IdSchema,
  jobId: IdSchema,
  created: z.coerce.date(),
  /** Once true, the codebook can no longer be edited/deleted (design plan §2). */
  immutable: z.boolean(),
});
export type CodebookResponse = z.infer<typeof CodebookResponseSchema>;

/** Metadata-only listing, e.g. for `GET /codebook`. */
export const CodebookMetaSchema = z.object({
  id: IdSchema,
  name: z.string(),
  created: z.coerce.date(),
  immutable: z.boolean(),
});
export type CodebookMeta = z.infer<typeof CodebookMetaSchema>;
