import type { TopLevelItem } from "@annotinder/contracts";

// What the visual editor needs of items edited as text (the JSON views):
// a known type, a name (except conditions), and for questions a variable with a type. Everything
// else is left to validation, whose messages the editor shows.

const ITEM_TYPES = ["question", "user_variable", "unit_variable", "unit_loop", "condition", "end"];

/** Why a parsed value isn't an item the editor can show; null if it is. With `children`, they are checked too. */
export function itemShapeError(raw: unknown, { children }: { children: boolean }): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 'An item must be an object ({ "name": ..., "type": ... })';
  const item = raw as Record<string, unknown>;
  const label = typeof item.name === "string" && item.name ? `'${item.name}'` : "An item";
  if (typeof item.type !== "string" || !ITEM_TYPES.includes(item.type)) return `${label}: type must be one of ${ITEM_TYPES.join(", ")}`;
  if (item.type !== "condition" && typeof item.name !== "string") return `${label} needs a name`;
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
 * selected, and compared with the last save. Conditions have no name: they
 * match the condition at the same place (the nth condition in the same
 * parent).
 */
export function carryKeys(next: TopLevelItem[], previous: TopLevelItem[]): TopLevelItem[] {
  const keys = new Map<string, string>();
  const index = (list: unknown[], parent: string) => {
    let conditions = 0;
    for (const raw of list) {
      const item = raw as Record<string, unknown>;
      const id = item.type === "condition" ? `${parent}/condition ${conditions++}` : typeof item.name === "string" ? item.name : null;
      const key = typeof item._key === "string" ? item._key : undefined;
      if (id && key && !keys.has(id)) keys.set(id, key);
      if (Array.isArray(item.children)) index(item.children, key ?? "?");
    }
  };
  index(previous, "");

  const used = new Set<string>();
  const walk = (list: unknown[], parent: string): unknown[] => {
    let conditions = 0;
    return list.map((raw) => {
      const item = { ...(raw as Record<string, unknown>) };
      const id = item.type === "condition" ? `${parent}/condition ${conditions++}` : typeof item.name === "string" ? item.name : null;
      const key = id ? keys.get(id) : undefined;
      if (!item._key && key && !used.has(key)) {
        item._key = key;
        used.add(key);
      }
      if (Array.isArray(item.children)) item.children = walk(item.children, typeof item._key === "string" ? item._key : "-");
      return item;
    });
  };
  return walk(next, "") as TopLevelItem[];
}
