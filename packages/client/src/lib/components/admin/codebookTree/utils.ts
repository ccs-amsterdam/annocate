import type { CodebookItem, InLoopItem, TopLevelItem } from "@annotinder/contracts";
import { isInsideUnitLoop } from "../../../codebook/tree";

export type TreeNode = TopLevelItem | InLoopItem;
export type ItemType = CodebookItem["type"];

/** Stable identifier of an item: the client-side `_key`, falling back to its name. */
export function getItemKey(item: CodebookItem): string {
  return (item as { _key?: string })._key || item.name;
}

export function getChildren(item: TreeNode): TreeNode[] | null {
  if ("children" in item && Array.isArray(item.children)) return item.children as TreeNode[];
  return null;
}

/** Item types that can be created inside the given container (null = codebook root). */
export function insertableTypesIn(items: TopLevelItem[], container: TreeNode | null): ItemType[] {
  const inLoop =
    container !== null &&
    (container.type === "unit_loop" || isInsideUnitLoop(items, getItemKey(container)));
  return inLoop ? ["question", "condition"] : ["question", "unit_loop", "condition"];
}

/** Item types that can be created as a sibling of the given item. */
export function insertableTypesNextTo(items: TopLevelItem[], item: TreeNode): ItemType[] {
  const inLoop = isInsideUnitLoop(items, getItemKey(item));
  return inLoop ? ["question", "condition"] : ["question", "unit_loop", "condition"];
}
