import type { TopLevelItem } from "@annotinder/contracts";
import { ELSE } from "../codebook/tree";
import { elseAsStandIns } from "./itemEdit";

// What the visual editor needs of items edited as text (the JSON views):
// a known type, a name (except branches, unit loops and layouts), and for questions a variable with a type. Everything
// else is left to validation, whose messages the editor shows.

const ITEM_TYPES = ["question", "experiment", "unit_loop", "branch", "end", "layout"];

/** Why a parsed value isn't an item the editor can show; null if it is. With `children`, they are checked too. */
export function itemShapeError(raw: unknown, { children }: { children: boolean }): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return 'An item must be an object ({ "name": ..., "type": ... })';
  const item = raw as Record<string, unknown>;
  const label = typeof item.name === "string" && item.name ? `'${item.name}'` : "An item";
  if (typeof item.type !== "string" || !ITEM_TYPES.includes(item.type))
    return `${label}: type must be one of ${ITEM_TYPES.join(", ")}`;
  if (!["branch", "unit_loop", "layout"].includes(item.type) && typeof item.name !== "string")
    return `${label} needs a name`;
  const isQuestion = item.type === "question" || item.type === "experiment";
  const variable = item.variable as { type?: unknown } | undefined;
  if (isQuestion && (!variable || typeof variable !== "object" || typeof variable.type !== "string")) {
    return `${label}: a question needs a "variable" with a "type"`;
  }
  if (!children) return ownListError(item, label);
  return listError(item, "children", label) ?? listError(item, "elseChildren", label);
}

/** An item edited by itself (the item's JSON) has no lists of items: the tree edits those. */
function ownListError(item: Record<string, unknown>, label: string): string | null {
  if ("children" in item) return `${label}: children are edited as items of their own: leave out "children"`;
  if ("elseChildren" in item) return `${label}: else items are edited as items of their own: leave out "elseChildren"`;
  return null;
}

/** Why an item's list of items (`children`, a branch's `elseChildren`) can't be shown; null if it can, or it has none. */
function listError(item: Record<string, unknown>, list: "children" | "elseChildren", label: string): string | null {
  if (!(list in item)) return null;
  const items = item[list];
  if (!Array.isArray(items)) return `${label}: "${list}" must be a list`;
  for (const child of items) {
    const error = itemShapeError(child, { children: true });
    if (error) return error;
  }
  return null;
}

/** Why a parsed value isn't a list of items the editor can show; null if it is. */
export function itemsShapeError(raw: unknown): string | null {
  if (!Array.isArray(raw)) return "A design is a list of items: [ { ... }, { ... } ]";
  for (const item of raw) {
    const error = itemShapeError(item, { children: true });
    if (error) return error;
  }
  return null;
}

/** The items without a name: the Study entry, branches, unit loops, layouts, and the editor's stand-in for a branch's else items. */
const UNNAMED = ["session", "branch", "unit_loop", "layout", ELSE];

/** How many items of each unnamed type came before in a list. */
type Counts = Map<string, number>;

/**
 * An item's identity for matching keys: its name, or for an item without
 * one its place: the nth of its type in `parent`.
 */
function matchId(item: Record<string, unknown>, parent: string, counts: Counts): string | null {
  if (typeof item.type === "string" && UNNAMED.includes(item.type)) {
    const nth = counts.get(item.type) ?? 0;
    counts.set(item.type, nth + 1);
    return `${parent}/${item.type} ${nth}`;
  }
  return typeof item.name === "string" ? item.name : null;
}

/**
 * Gives items that come without editor keys (e.g. from text) the keys of the
 * items with the same name in `previous`, so they stay the same items:
 * selected, and compared with the last save. Branches, unit loops and
 * layouts have no name: they match the one at the same place (the nth
 * branch, loop or layout in the same parent). A branch's else items
 * (`elseChildren` in text) come back as the editor holds them, in their
 * stand-in, which keeps its key too.
 */
export function carryKeys(next: TopLevelItem[], previous: TopLevelItem[]): TopLevelItem[] {
  const keys = new Map<string, string>();
  const index = (list: unknown[], parent: string) => {
    const counts: Counts = new Map();
    for (const raw of list) {
      const item = raw as Record<string, unknown>;
      const id = matchId(item, parent, counts);
      const key = typeof item._key === "string" ? item._key : undefined;
      if (id && key && !keys.has(id)) keys.set(id, key);
      if (Array.isArray(item.children)) index(item.children, key ?? "?");
    }
  };
  index(previous, "");

  const used = new Set<string>();
  const walk = (list: unknown[], parent: string): unknown[] => {
    const counts: Counts = new Map();
    return list.map((raw) => {
      const item = { ...(raw as Record<string, unknown>) };
      const id = matchId(item, parent, counts);
      const key = id ? keys.get(id) : undefined;
      if (!item._key && key && !used.has(key)) {
        item._key = key;
        used.add(key);
      }
      if (Array.isArray(item.children))
        item.children = walk(item.children, typeof item._key === "string" ? item._key : "-");
      return item;
    });
  };
  return walk(elseAsStandIns(next), "") as TopLevelItem[];
}

/** Why parsed text isn't a design the editor can show; null if it is. */
export function designShapeError(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return 'The design is an object: { "public": ..., "session": ..., "items": [ ... ] }';
  const design = raw as Record<string, unknown>;
  const unknown = Object.keys(design).filter((k) => !["public", "session", "items"].includes(k));
  if (unknown.length)
    return `Unknown key${unknown.length > 1 ? "s" : ""} ${unknown.map((k) => `"${k}"`).join(", ")}: a design has "public", "session" and "items"`;
  if (
    design.session !== undefined &&
    (!design.session || typeof design.session !== "object" || Array.isArray(design.session))
  ) {
    return '"session" must be an object, e.g. { "urlParams": [] }';
  }
  if (
    design.public !== undefined &&
    design.public !== null &&
    (typeof design.public !== "object" || Array.isArray(design.public))
  ) {
    return '"public" must be an object, e.g. { "title": "..." }, or null';
  }
  if ((design.items as unknown[] | undefined)?.some?.((i) => (i as { type?: unknown } | null)?.type === "session")) {
    return 'The session goes in "session", not in "items"';
  }
  return itemsShapeError(design.items);
}
