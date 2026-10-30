import { itemName, type CodebookItem, type InLoopItem, type TopLevelItem } from "@annotinder/contracts";
import { positionInLoop, type TreePosition } from "../../../codebook/codebookEdit";

export type TreeNode = TopLevelItem | InLoopItem;
export type ItemType = CodebookItem["type"];

/** Stable identifier of an item: the client-side `_key`, falling back to its name. */
export function getItemKey(item: CodebookItem): string {
  return (item as { _key?: string })._key || itemName(item) || "";
}

export function getChildren(item: TreeNode): TreeNode[] | null {
  if ("children" in item && Array.isArray(item.children)) return item.children as TreeNode[];
  return null;
}

/** Item types that can be created at a position (no loops in a loop). */
export function insertableTypesAt(items: TopLevelItem[], position: TreePosition): ItemType[] {
  if (positionInLoop(items, position)) return ["question", "condition", "end"];
  // The Session item: once, at the top (inserted there wherever it is added)
  return items.some((i) => i.type === "session") ? ["question", "unit_loop", "condition", "end"] : ["question", "unit_loop", "condition", "end", "session"];
}
