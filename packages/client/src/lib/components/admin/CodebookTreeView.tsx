import { useEffect, useState } from "react";
import type { CodebookValidationIssue, TopLevelItem } from "@annotinder/contracts";
import { canMoveItemTo, canMoveToRootEnd, type MoveTargetPosition } from "../../codebook/codebookEdit";
import { CodebookTreeProvider, type CodebookTreeState } from "./codebookTree/context";
import { TreeList } from "./codebookTree/TreeList";
import type { ItemType } from "./codebookTree/utils";

interface CodebookTreeViewProps {
  items: TopLevelItem[];
  selected: string | null;
  onSelect: (identifier: string) => void;
  onInsertBefore: (targetIdentifier: string, type: ItemType) => void;
  onInsertAtEnd: (parentIdentifier: string | null, type: ItemType) => void;
  onDelete: (identifier: string) => void;
  onMoveItem: (source: string, target: string, position: MoveTargetPosition) => void;
  onMoveToRootEnd: (source: string) => void;
  validationIssues?: CodebookValidationIssue[];
  /** Immutable codebook: items can be selected, but not added, moved or deleted. */
  readOnly?: boolean;
}

/**
 * Hierarchical view of the codebook items.
 *
 * Every list has N items and N+1 positions. Each item row targets the position
 * *above* itself (both for "+" and for move targets), and every list ends with
 * a ListEndRow that targets the position after the last item.
 *
 * Components (see ./codebookTree):
 * - TreeList     recursive list of items, closed by a ListEndRow
 * - TreeItemRow  an item row (EditItemRow / MoveItemRow)
 * - ListEndRow   "add to end" / "Move here" row
 * - TreeRow      shared fixed-height row layout + insertion line
 * - AddItemMenu  "+" button with item type menu
 */
export function CodebookTreeView({
  items,
  selected,
  onSelect,
  onInsertBefore,
  onInsertAtEnd,
  onDelete,
  onMoveItem,
  onMoveToRootEnd,
  validationIssues = [],
  readOnly = false,
}: CodebookTreeViewProps) {
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const cancelMove = () => setMovingKey(null);

  useEffect(() => {
    if (movingKey === null) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMovingKey(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [movingKey]);

  const state: CodebookTreeState = {
    items,
    selected,
    movingKey,
    readOnly,

    select: onSelect,
    remove: onDelete,
    insertBefore: onInsertBefore,
    insertAtEnd: onInsertAtEnd,

    startMove: setMovingKey,
    cancelMove,
    canMoveBefore: (targetKey) =>
      movingKey !== null && canMoveItemTo(items, movingKey, targetKey, "before"),
    moveBefore: (targetKey) => {
      if (movingKey !== null) onMoveItem(movingKey, targetKey, "before");
      cancelMove();
    },
    canMoveToEnd: (parentKey) => {
      if (movingKey === null) return false;
      if (parentKey === null) return canMoveToRootEnd(items, movingKey);
      return canMoveItemTo(items, movingKey, parentKey, "inside");
    },
    moveToEnd: (parentKey) => {
      if (movingKey !== null) {
        if (parentKey === null) onMoveToRootEnd(movingKey);
        else onMoveItem(movingKey, parentKey, "inside");
      }
      cancelMove();
    },

    getIssue: (item) =>
      validationIssues.find((issue) => item.name && issue.message.includes(`'${item.name}'`))?.message ?? null,
  };

  return (
    <CodebookTreeProvider value={state}>
      {/* In move mode, clicking anywhere that isn't a target cancels the move */}
      <div className="flex flex-col p-1 pb-3" onClick={movingKey !== null ? cancelMove : undefined}>
        <TreeList nodes={items} parent={null} />
      </div>
    </CodebookTreeProvider>
  );
}
