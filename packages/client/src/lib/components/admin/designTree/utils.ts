import { itemName, type DesignItem, type InLoopItem, type TopLevelItem } from "@annotinder/contracts";
import { positionInLoop, type TreePosition } from "../../../design/itemEdit";

export type TreeNode = TopLevelItem | InLoopItem;
/** A type of item to add: an item's, or `questions`, a new Questions block (its first question). */
export type ItemType = DesignItem["type"] | "questions";

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
 * The top level of the tree as blocks (docs/client.md §7 "Blocks"): each
 * unit loop, and each run of other items between them a Questions block.
 * Only the tree groups them; the design keeps them in one list.
 */
export type TopBlock =
  | { kind: "loop"; item: Extract<TopLevelItem, { type: "unit_loop" }> }
  | { kind: "questions"; key: string; items: TopLevelItem[] };

export function topBlocks(items: readonly TopLevelItem[]): TopBlock[] {
  const blocks: TopBlock[] = [];
  for (const item of items) {
    if (item.type === "session") continue;
    if (item.type === "unit_loop") blocks.push({ kind: "loop", item });
    else {
      const last = blocks.at(-1);
      if (last?.kind === "questions") last.items.push(item);
      else blocks.push({ kind: "questions", key: `__block_${getItemKey(item)}`, items: [item] });
    }
  }
  return blocks;
}

/**
 * Whether a position is among a Questions block's items, not in a loop
 * (else between blocks: at the end, or next to a unit loop).
 */
function inQuestionsBlock(items: readonly TopLevelItem[], position: TreePosition): boolean {
  const key = "after" in position ? position.after : "before" in position ? position.before : position.into;
  if (key === null) return false;
  const top = items.find((i) => getItemKey(i) === key);
  // Not at the top level: in a condition in a block
  return top === undefined || top.type !== "unit_loop";
}

/**
 * Item types that can be created at a position: in a loop its items; in a
 * Questions block questions, computed items, conditions and ends; between
 * blocks a new block (a unit loop, or Questions: a block with a first
 * question).
 */
export function insertableTypesAt(items: TopLevelItem[], position: TreePosition): ItemType[] {
  if (positionInLoop(items, position)) return ["question", "show_if", "end"];
  if (inQuestionsBlock(items, position)) return ["question", "computed", "show_if", "end"];
  // (The Study entry is always there, first: never added)
  return ["questions", "unit_loop"];
}

/** The key of the "At the end" row: the study's normal end (the Study entry's `end`), not an item. */
export const STUDY_END_KEY = "__study_end";
