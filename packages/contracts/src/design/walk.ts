import type { DesignItem } from "./item.js";

// One walk over a design's items, for the many helpers that look through
// the tree. They often get raw input (a design not validated yet, or being
// validated), so the walk tolerates anything: non-arrays, null items.

/** Where an item is, as in validation issues: `[1, "children", 0]`, a branch's else item `[1, "elseChildren", 0]`. */
export type ItemPath = (string | number)[];

/** The lists an item can hold. */
export type ItemListKey = "children" | "elseChildren";

/** The lists an item holds (as saved): its `children`, and a branch's `elseChildren` after them; non-arrays left out. */
export function itemLists(item: unknown): { key: ItemListKey; list: DesignItem[] }[] {
  const it = item as { children?: unknown; elseChildren?: unknown } | null;
  const out: { key: ItemListKey; list: DesignItem[] }[] = [];
  if (Array.isArray(it?.children)) out.push({ key: "children", list: it.children as DesignItem[] });
  if (Array.isArray(it?.elseChildren)) out.push({ key: "elseChildren", list: it.elseChildren as DesignItem[] });
  return out;
}

/**
 * Visits every item of a list in document order, each before the items it
 * holds (`children`, then a branch's `elseChildren`), with its path below
 * `path`. Anything that isn't an object is passed over. The visitor returns
 * `"skip"` to not go into an item: most helpers only go into branches.
 */
export function forEachItem<T = Partial<DesignItem>>(
  list: unknown,
  visit: (item: T, path: ItemPath) => void | "skip",
  path: ItemPath = [],
): void {
  if (!Array.isArray(list)) return;
  list.forEach((raw: unknown, i) => {
    if (!raw || typeof raw !== "object") return;
    const at = [...path, i];
    if (visit(raw as T, at) === "skip") return;
    for (const { key, list: inner } of itemLists(raw)) forEachItem(inner, visit, [...at, key]);
  });
}
