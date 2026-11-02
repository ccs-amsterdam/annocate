import { createContext, useContext } from "react";
import type { DesignItem, TopLevelItem } from "@annotinder/contracts";
import type { TreePosition } from "../../../design/itemEdit";
import type { ItemType } from "./utils";

/**
 * Everything the tree rows need, shared via context so the recursive
 * components don't have to drill a dozen props through every level.
 */
export interface DesignTreeState {
  items: TopLevelItem[];
  /** The item open in the editor. */
  selected: string | null;
  /** Immutable codebook: no add, move or delete actions. */
  readOnly: boolean;
  select: (key: string) => void;

  /** Items ticked for moving or deleting (a ticked container brings its children). */
  checked: ReadonlySet<string>;
  toggleChecked: (key: string) => void;
  /** Whether the item is ticked itself or is inside a ticked item. */
  isChecked: (key: string) => boolean;

  /** Where a row's + can add (after it; more than one where that is ambiguous). */
  addPositions: (key: string) => TreePosition[];
  addAt: (position: TreePosition, type: ItemType) => void;

  /** While moving the ticked items: whether, and moving them to, a position. */
  moving: boolean;
  canMoveTo: (position: TreePosition) => boolean;
  moveTo: (position: TreePosition) => void;

  /** The positions an add or move button points at (insertion lines). */
  preview: TreePosition[];
  setPreview: (positions: TreePosition[]) => void;

  getIssue: (item: DesignItem) => string | null;
  /** Whether the item has unsaved changes. */
  isChanged: (item: DesignItem) => boolean;
}

const DesignTreeContext = createContext<DesignTreeState | null>(null);

export const DesignTreeProvider = DesignTreeContext.Provider;

export function useDesignTree(): DesignTreeState {
  const state = useContext(DesignTreeContext);
  if (!state) throw new Error("useDesignTree must be used inside <DesignTreeProvider>");
  return state;
}

/** Whether two positions are the same place. */
export function samePosition(a: TreePosition, b: TreePosition): boolean {
  if ("into" in a) return "into" in b && a.into === b.into;
  if ("before" in a) return "before" in b && a.before === b.before;
  return "after" in b && a.after === b.after;
}
