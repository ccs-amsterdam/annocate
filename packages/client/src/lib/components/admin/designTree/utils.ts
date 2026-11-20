import { designUses, itemName, type DesignItem, type InLoopItem, type TopLevelItem } from "@annotinder/contracts";
import { positionInLoop, type TreePosition } from "../../../design/itemEdit";

export type TreeNode = TopLevelItem | InLoopItem;
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
 * The questions' numbers, as the coding screen's top bar shows them: the
 * questions outside unit loops 1, 2, 3, ...; in a unit loop, its questions
 * from 1 (through conditions, in design order; a condition that hides a
 * question doesn't renumber the rest here).
 */
export function questionNumbers(items: readonly TreeNode[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const walk = (list: readonly TreeNode[], counter: { n: number }) => {
    for (const item of list) {
      if (item.type === "question") numbers.set(getItemKey(item), ++counter.n);
      else if (item.type === "unit_loop") walk(getChildren(item) ?? [], { n: 0 });
      else if (item.type === "show_if") walk(getChildren(item) ?? [], counter);
    }
  };
  walk(items, { n: 0 });
  return numbers;
}

/**
 * Item types that can be created at a position: no loops in a loop, and
 * only what the design uses (contracts `designUses`): without units no unit
 * loops; annotating only, nothing outside its one loop; computed items
 * with an experiment and questions outside the units.
 */
export function insertableTypesAt(items: TopLevelItem[], position: TreePosition): ItemType[] {
  if (positionInLoop(items, position)) return ["question", "show_if", "end"];
  // (The Study entry is always there, first: never added)
  const uses = designUses(items);
  if (uses.content === "annotate") return [];
  return [
    "question",
    ...(uses.experiment ? (["computed"] as const) : []),
    ...(uses.content === "both" ? (["unit_loop"] as const) : []),
    "show_if",
    "end",
  ];
}

/** Annotating only (contracts `designUses`): the one unit loop, whose items the tree shows as the top level; else null. */
export function singleLoop(items: TopLevelItem[]): Extract<TopLevelItem, { type: "unit_loop" }> | null {
  if (designUses(items).content !== "annotate") return null;
  const loops = items.filter((i) => i.type === "unit_loop");
  return loops.length === 1 && items.every((i) => i.type === "unit_loop" || i.type === "session")
    ? (loops[0] as Extract<TopLevelItem, { type: "unit_loop" }>)
    : null;
}

/** The key of the "At the end" row: the study's normal end (the Study entry's `end`), not an item. */
export const STUDY_END_KEY = "__study_end";
