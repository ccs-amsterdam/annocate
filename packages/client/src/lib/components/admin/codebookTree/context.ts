import { createContext, useContext } from "react";
import type { CodebookItem, TopLevelItem } from "@annotinder/contracts";
import type { TreePosition } from "../../../codebook/codebookEdit";
import type { ItemType } from "./utils";

/**
 * Everything the tree rows need, shared via context so the recursive
 * components don't have to drill a dozen props through every level.
 */
export interface CodebookTreeState {
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

  /** The position an add menu points at (an insertion line). */
  preview: TreePosition | null;
  setPreview: (position: TreePosition | null) => void;

  getIssue: (item: CodebookItem) => string | null;
  /** Whether the item has unsaved changes. */
  isChanged: (item: CodebookItem) => boolean;
}

const CodebookTreeContext = createContext<CodebookTreeState | null>(null);

export const CodebookTreeProvider = CodebookTreeContext.Provider;

export function useCodebookTree(): CodebookTreeState {
  const state = useContext(CodebookTreeContext);
  if (!state) throw new Error("useCodebookTree must be used inside <CodebookTreeProvider>");
  return state;
}

/** Whether two positions are the same place. */
export function samePosition(a: TreePosition | null, b: TreePosition): boolean {
  if (a === null) return false;
  if ("into" in a) return "into" in b && a.into === b.into;
  if ("before" in a) return "before" in b && a.before === b.before;
  return "after" in b && a.after === b.after;
}
