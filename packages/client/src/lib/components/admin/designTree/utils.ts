import { itemName, type DesignItem, type InLoopItem, type TopLevelItem } from "@annotinder/contracts";
import { positionInLoop, type TreePosition } from "../../../design/itemEdit";

export type TreeNode = TopLevelItem | InLoopItem;
/** A type of item (to add). */
export type ItemType = DesignItem["type"];

/** Stable identifier of an item: the client-side `_key`, falling back to its name. */
export function getItemKey(item: DesignItem): string {
  return (item as { _key?: string })._key || itemName(item) || "";
}

/**
 * Where a position is: in a unit loop, in a branch (outside loops), or at
 * the top level (where unit loops can go too).
 */
function placeOf(items: readonly TopLevelItem[], position: TreePosition): "loop" | "branch" | "top" {
  if (positionInLoop(items as TopLevelItem[], position)) return "loop";
  if ("into" in position) return position.into === null ? "top" : "branch";
  const key = "before" in position ? position.before : position.after;
  // Next to a top-level item: at the top level; else inside a branch
  return items.some((i) => getItemKey(i) === key) ? "top" : "branch";
}

/**
 * Item types that can be created at a position: in a loop its items; in a
 * branch questions, experiments, nested branches and ends; at the top level
 * the same with unit loops instead of ends.
 */
export function insertableTypesAt(items: TopLevelItem[], position: TreePosition): ItemType[] {
  const place = placeOf(items, position);
  if (place === "loop") return ["question", "layout", "branch", "end"];
  if (place === "branch") return ["question", "experiment", "branch", "end"];
  // (The Study entry is always there, first: never added)
  return ["question", "experiment", "branch", "unit_loop"];
}

/** The key of the "At the end" row: the study's normal end (the Study entry's `end`), not an item. */
export const STUDY_END_KEY = "__study_end";
