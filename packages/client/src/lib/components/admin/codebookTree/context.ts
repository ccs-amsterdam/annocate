import { createContext, useContext } from "react";
import type { CodebookItem, TopLevelItem } from "@annotinder/contracts";
import type { ItemType } from "./utils";

/**
 * Everything the tree rows need, shared via context so the recursive
 * components don't have to drill a dozen props through every level.
 */
export interface CodebookTreeState {
  items: TopLevelItem[];
  selected: string | null;
  /** Key of the item currently being moved, or null when not in move mode. */
  movingKey: string | null;
  /** Immutable codebook: no add, move or delete actions. */
  readOnly: boolean;

  select: (key: string) => void;
  remove: (key: string) => void;
  insertBefore: (targetKey: string, type: ItemType) => void;
  /** parentKey null = codebook root */
  insertAtEnd: (parentKey: string | null, type: ItemType) => void;

  startMove: (key: string) => void;
  cancelMove: () => void;
  canMoveBefore: (targetKey: string) => boolean;
  moveBefore: (targetKey: string) => void;
  canMoveToEnd: (parentKey: string | null) => boolean;
  moveToEnd: (parentKey: string | null) => void;

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
