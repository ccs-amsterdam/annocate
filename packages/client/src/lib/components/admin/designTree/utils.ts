import { itemName, type DesignItem, type InLoopItem, type TopLevelItem } from "@annotinder/contracts";
import { positionInLoop, type TreePosition } from "../../../design/itemEdit";

export type TreeNode = TopLevelItem | InLoopItem;
/** A type of item (to add). */
export type ItemType = DesignItem["type"];

/** Stable identifier of an item: the client-side `_key`, falling back to its name. */
export function getItemKey(item: DesignItem): string {
  return (item as { _key?: string })._key || itemName(item) || "";
}

export function getChildren(item: TreeNode): TreeNode[] | null {
  if ("children" in item && Array.isArray(item.children)) return item.children as TreeNode[];
  return null;
}

/**
 * Where a position is: in a unit loop, in a questions block (outside loops),
 * or at the top level (between blocks: where questions blocks and unit
 * loops go).
 */
function placeOf(items: readonly TopLevelItem[], position: TreePosition): "loop" | "block" | "top" {
  if (positionInLoop(items as TopLevelItem[], position)) return "loop";
  if ("into" in position) return position.into === null ? "top" : "block";
  const key = "before" in position ? position.before : position.after;
  // Next to a top-level item: between blocks; else inside a block
  return items.some((i) => getItemKey(i) === key) ? "top" : "block";
}

/**
 * Item types that can be created at a position: in a loop its items; in a
 * questions block questions, computed items, nested questions blocks and
 * ends; at the top level a questions block or a unit loop.
 */
export function insertableTypesAt(items: TopLevelItem[], position: TreePosition): ItemType[] {
  const place = placeOf(items, position);
  if (place === "loop") return ["question", "questions", "end"];
  if (place === "block") return ["question", "computed", "questions", "end"];
  // (The Study entry is always there, first: never added)
  return ["questions", "unit_loop"];
}

/** The key of the "At the end" row: the study's normal end (the Study entry's `end`), not an item. */
export const STUDY_END_KEY = "__study_end";
