import { z } from "zod";
import { IdSchema } from "./common.js";

// Lists in the researcher API are objects, `{ <items>: [...], next? }`, so
// that a list can be read in pages (docs/api/README.md): a request may give
// `limit` (how many items at most) and `after` (the id of the last item it
// got); a response that leaves items out has `next`, the `after` of the next
// request. Without `limit` a list comes whole, unless it is longer than
// `DEFAULT_LIST_LIMIT`.

/** The most items a list returns when the request doesn't say (`limit`). */
export const DEFAULT_LIST_LIMIT = 10_000;
/** The most items a request can ask for at once. */
export const MAX_LIST_LIMIT = 10_000;

/** The query of a list: both optional. */
export const ListQuerySchema = z.object({
  /** The id of the last item of the page before: the list continues after it. */
  after: z.coerce.number().int().positive().optional(),
  /** The most items to return (default and at most 10,000). */
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

/**
 * A list response: the items under `key`, and `next` when the list goes on
 * (the id to give as `after`).
 */
export function listResponse<K extends string, S extends z.ZodType>(key: K, item: S) {
  return z.object({ [key]: z.array(item), next: IdSchema.optional() } as { [P in K]: z.ZodArray<S> } & {
    next: z.ZodOptional<typeof IdSchema>;
  });
}
