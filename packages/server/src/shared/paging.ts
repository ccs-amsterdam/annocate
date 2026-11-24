import type { Context } from "hono";
import { DEFAULT_LIST_LIMIT, ListQuerySchema } from "@annotinder/contracts";
import { HttpError } from "./http.js";
import { parseQuery } from "./request.js";

/**
 * A list as the API returns it (contracts paging.ts): `{ <key>: items, next? }`.
 * The request's `limit` (default `defaultLimit`) and `after` (the id of
 * the last item of the page before) choose the part of `items`, which are in
 * the list's own order; `next` is set when items are left. 400 for an `after`
 * that isn't in the list (e.g. the item was deleted since).
 */
export function listPage<K extends string, T extends { id: number }>(
  c: Context,
  key: K,
  items: T[],
  defaultLimit = DEFAULT_LIST_LIMIT,
): { [P in K]: T[] } & { next?: number } {
  const { after, limit = defaultLimit } = parseQuery(c, ListQuerySchema);
  let start = 0;
  if (after !== undefined) {
    const at = items.findIndex((item) => item.id === after);
    if (at < 0) throw new HttpError(400, `after: no item ${after} in this list (start again without after)`);
    start = at + 1;
  }
  const page = items.slice(start, start + limit);
  const more = start + limit < items.length;
  return { [key]: page, ...(more ? { next: page[page.length - 1]!.id } : {}) } as { [P in K]: T[] } & { next?: number };
}
