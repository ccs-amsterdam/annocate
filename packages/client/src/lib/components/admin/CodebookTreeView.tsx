import { useEffect, useState } from "react";
import { CornerDownLeft, Move, Trash2, X } from "lucide-react";
import type { CodebookValidationIssue, TopLevelItem } from "@annotinder/contracts";
import {
  addPositions,
  canMoveAllTo,
  isInSelection,
  moveChanges,
  topmostSelected,
  type TreePosition,
} from "../../codebook/codebookEdit";
import { issueIsAbout } from "../../codebook/tree";
import { Button } from "@/components/ui/button";
import { CodebookTreeProvider, type CodebookTreeState } from "./codebookTree/context";
import { TreeList } from "./codebookTree/TreeList";
import { AddItemMenu } from "./codebookTree/AddItemMenu";
import { getItemKey, insertableTypesAt, type ItemType } from "./codebookTree/utils";

interface CodebookTreeViewProps {
  items: TopLevelItem[];
  selected: string | null;
  onSelect: (identifier: string) => void;
  onAdd: (position: TreePosition, type: ItemType) => void;
  /** Deletes items (asking first); returns whether they were deleted. */
  onDelete: (keys: string[]) => boolean;
  onMove: (keys: string[], position: TreePosition) => void;
  validationIssues?: CodebookValidationIssue[];
  /** Keys of items with unsaved changes (marked in the tree). */
  changed?: ReadonlySet<string>;
  /** Immutable codebook: items can be selected, but not added, moved or deleted. */
  readOnly?: boolean;
}

/**
 * Hierarchical view of the codebook items.
 *
 * - Adding: each row has a + (on hover) that adds below it. Where "below"
 *   is ambiguous (the last item of a loop: inside or after the loop; an
 *   empty loop or condition: inside or after it) its menu asks where first.
 * - Moving and deleting: tick items (a container brings its children),
 *   then Move or Delete in the toolbar. While moving, each row's + becomes
 *   "move below this item" (asking where if ambiguous, like adding), on
 *   rows where all ticked items may go; nothing else in the tree changes.
 *
 * Components (see ./codebookTree):
 * - TreeList     recursive list of items
 * - TreeItemRow  an item row: tick box, item, +
 * - TreeRow      shared fixed-height row layout + insertion line
 * - AddItemMenu  "+" button: where (if ambiguous), then item type; or where to move
 */
export function CodebookTreeView({
  items,
  selected,
  onSelect,
  onAdd,
  onDelete,
  onMove,
  validationIssues = [],
  changed,
  readOnly = false,
}: CodebookTreeViewProps) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [preview, setPreview] = useState<TreePosition[]>([]);

  // Ticked items that still exist (undo can remove them), not inside another ticked one.
  const ticked = topmostSelected(items, checked);
  const clear = () => {
    setChecked(new Set());
    setMoving(false);
  };

  useEffect(() => {
    if (!moving && checked.size === 0) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (moving) setMoving(false);
      else setChecked(new Set());
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moving, checked.size]);

  const state: CodebookTreeState = {
    items,
    selected,
    readOnly,
    select: onSelect,

    checked,
    toggleChecked: (key) => {
      const next = new Set(checked);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setChecked(next);
    },
    isChecked: (key) => isInSelection(items, checked, key),

    addPositions: (key) => addPositions(items, key),
    addAt: (position, type) => {
      setPreview([]);
      onAdd(position, type);
    },

    moving,
    canMoveTo: (position) => canMoveAllTo(items, ticked, position) && moveChanges(items, ticked, position),
    moveTo: (position) => {
      onMove(ticked, position);
      setPreview([]);
      clear();
    },

    preview,
    setPreview,

    isChanged: (item) => changed?.has(getItemKey(item)) ?? false,
    getIssue: (item) => validationIssues.find((issue) => issueIsAbout(items, issue, item))?.message ?? null,
  };

  const end: TreePosition = { into: null };
  const count = ticked.length === 1 ? "1 item" : `${ticked.length} items`;

  return (
    <CodebookTreeProvider value={state}>
      {!readOnly && (
        <div className="sticky top-0 z-10 flex min-h-9 flex-wrap items-center gap-2 bg-card px-1 pb-1 text-xs text-muted-foreground">
          {moving ? (
            <>
              <span className="font-medium text-primary">
                Click <CornerDownLeft className="inline h-3.5 w-3.5" /> on a row to move {count} below it
              </span>
              {items.length > 0 && state.canMoveTo({ before: getItemKey(items[0]) }) && (
                <Button size="sm" variant="outline" className="h-7" onClick={() => state.moveTo({ before: getItemKey(items[0]) })}>
                  Move to the top
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setMoving(false)}>
                Cancel
              </Button>
            </>
          ) : ticked.length > 0 ? (
            <>
              <span className="px-2 font-medium text-foreground">{count} selected</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMoving(true)}>
                <Move className="mr-1 h-3.5 w-3.5" /> Move
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-destructive hover:text-destructive text-xs"
                onClick={() => onDelete(ticked) && clear()}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto h-7" title="Clear selection (Esc)" onClick={clear}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : items.length > 0 ? (
            <span>Hover an item to add one below it, or tick items to move or delete them.</span>
          ) : (
            <AddItemMenu
              label="Add item"
              options={[{ position: end, label: "First item", types: insertableTypesAt(items, end) }]}
              onAdd={state.addAt}
            />
          )}
        </div>
      )}
      <div className="flex flex-col p-1 pb-3">
        <TreeList nodes={items} parent={null} />
      </div>
    </CodebookTreeProvider>
  );
}
