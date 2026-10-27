import type { TopLevelItem } from "@annotinder/contracts";
import { flattenTree, keyOf } from "./tree";

// What the visual editor needs of items edited as text (the JSON views):
// a name, a known type, and for questions a variable with a type. Everything
// else is left to validation, whose messages the editor shows.

const ITEM_TYPES = ["question", "user_variable", "unit_variable", "unit_loop", "condition", "end"];

/** Why a parsed value isn't an item the editor can show; null if it is. With `children`, they are checked too. */
export function itemShapeError(raw: unknown, { children }: { children: boolean }): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 'An item must be an object ({ "name": ..., "type": ... })';
  const item = raw as Record<string, unknown>;
  const label = typeof item.name === "string" && item.name ? `'${item.name}'` : "An item";
  if (typeof item.name !== "string") return `${label} needs a name`;
  if (typeof item.type !== "string" || !ITEM_TYPES.includes(item.type)) return `${label}: type must be one of ${ITEM_TYPES.join(", ")}`;
  const isQuestion = item.type === "question" || item.type === "user_variable" || item.type === "unit_variable";
  const variable = item.variable as { type?: unknown } | undefined;
  if (isQuestion && (!variable || typeof variable !== "object" || typeof variable.type !== "string")) {
    return `${label}: a question needs a "variable" with a "type"`;
  }
  if (!children) {
    return "children" in item ? `${label}: children are edited as items of their own: leave out "children"` : null;
  }
  if ("children" in item) {
    if (!Array.isArray(item.children)) return `${label}: "children" must be a list`;
    for (const child of item.children) {
      const error = itemShapeError(child, { children: true });
      if (error) return error;
    }
  }
  return null;
}

/** Why a parsed value isn't a list of items the editor can show; null if it is. */
export function itemsShapeError(raw: unknown): string | null {
  if (!Array.isArray(raw)) return "A codebook is a list of items: [ { ... }, { ... } ]";
  for (const item of raw) {
    const error = itemShapeError(item, { children: true });
    if (error) return error;
  }
  return null;
}

/**
 * Gives items that come without editor keys (e.g. from text) the keys of the
 * items with the same name in `previous`, so they stay the same items:
 * selected, and compared with the last save.
 */
export function carryKeys(next: TopLevelItem[], previous: TopLevelItem[]): TopLevelItem[] {
  const keys = new Map<string, string>();
  for (const item of flattenTree(previous)) {
    const key = keyOf(item);
    if (key && item.name && !keys.has(item.name)) keys.set(item.name, key);
  }
  const used = new Set<string>();
  const walk = (list: unknown[]): unknown[] =>
    list.map((raw) => {
      const item = { ...(raw as Record<string, unknown>) };
      const key = typeof item.name === "string" ? keys.get(item.name) : undefined;
      if (!item._key && key && !used.has(key)) {
        item._key = key;
        used.add(key);
      }
      if (Array.isArray(item.children)) item.children = walk(item.children);
      return item;
    });
  return walk(next) as TopLevelItem[];
}
