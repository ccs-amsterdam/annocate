import type { Condition, TopLevelItem, UnitLoopItem } from "@annotinder/contracts";
import { itemTitle } from "../../../codebook/conditions";
import { findItem, findParent, isElse } from "../../../codebook/tree";
import type { TreePosition } from "../../../design/itemEdit";
import { getItemKey, type TreeNode } from "./utils";

/**
 * A loop in the tree: its label, else just "Unit loop" (its sets show
 * next to it). Messages and exports, where loops must be told apart without
 * the tree, use the loop's id then (contracts `loopTitle`).
 */
function treeLoopTitle(loop: UnitLoopItem): string {
  return loop.label?.trim() || "Unit loop";
}

/** A branch's or loop's condition, if it has one yet. */
export function itemCondition(item: TreeNode): Condition | undefined {
  if (item.type !== "branch" && item.type !== "unit_loop") return undefined;
  return item.condition?.script.trim() ? item.condition : undefined;
}

/**
 * An item's name in its row; null: it has none to show. Branches have no
 * name: their label, else "Branch" while there is no condition either (the
 * condition shows next to it). A layout without a label is "Unit layout".
 */
export function itemLabelText(item: TreeNode): string | null {
  if (item.type === "branch") return item.label?.trim() || (itemCondition(item) ? null : "Branch");
  if (item.type === "unit_loop") return treeLoopTitle(item);
  if (item.type === "layout") return item.label?.trim() || "Unit layout";
  return itemTitle(item) || null;
}

/** How an item is called in menus: its title, a condition by its condition, a loop by its label. */
export function rowTitle(item: TreeNode): string {
  if (item.type === "unit_loop") return treeLoopTitle(item);
  return itemTitle(item) || "(unnamed)";
}

/** A container as the add menu names it: in quotes, an else part as its branch's "otherwise". */
function levelName(items: TopLevelItem[], container: TreeNode): string {
  if (isElse(container)) {
    const branch = findParent(items, getItemKey(container));
    return `"otherwise" of ${branch ? `"${rowTitle(branch as TreeNode)}"` : "the branch"}`;
  }
  return `"${rowTitle(container)}"`;
}

/** The item a position is in; null: the top level. */
function positionContainer(items: TopLevelItem[], position: TreePosition): TreeNode | null {
  if ("into" in position) return position.into === null ? null : (findItem(items, position.into) as TreeNode);
  return findParent(items, "before" in position ? position.before : position.after) as TreeNode | null;
}

/** How a position is called in the add menu: by its level ("In "Headlines"", "At the top level"). */
export function positionLabel(items: TopLevelItem[], position: TreePosition): string {
  const container = positionContainer(items, position);
  return container ? `In ${levelName(items, container)}` : "At the top level";
}

/** A position's label as a move: "Move into "Headlines"", "Move to the top level". */
export function moveLabel(label: string): string {
  return label.startsWith("In ") ? `Move into ${label.slice(3)}` : "Move to the top level";
}
