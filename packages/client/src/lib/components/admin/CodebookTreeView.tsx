import { useState } from "react";
import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  CodebookValidationIssue,
} from "@annotinder/contracts";
import {
  Repeat,
  GitBranch,
  CheckSquare,
  HelpCircle,
  Plus,
  Trash2,
  Move,
  X,
  AlertCircle,
} from "lucide-react";
import { canMoveItemTo, type MoveTargetPosition } from "../../codebook/codebookEdit";
import { findItem } from "../../codebook/tree";

function ItemIcon({ type }: { type: CodebookItem["type"] }) {
  switch (type) {
    case "unit_loop":
      return <Repeat className="h-4 w-4 text-primary shrink-0" />;
    case "condition":
      return <GitBranch className="h-4 w-4 text-amber-500 shrink-0" />;
    case "unit_variable":
      return <CheckSquare className="h-4 w-4 text-teal-600 shrink-0" />;
    case "user_variable":
      return <HelpCircle className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

interface CodebookTreeViewProps {
  items: TopLevelItem[];
  selected: string | null;
  onSelect: (identifier: string) => void;
  onAddChild: (parentIdentifier: string) => void;
  onDelete: (identifier: string) => void;
  onMoveItem: (source: string, target: string, position: MoveTargetPosition) => void;
  validationIssues?: CodebookValidationIssue[];
}

/**
 * Renders the codebook items as a clean, hierarchical tree view.
 *
 * Moving items:
 * - Clicking "Move" highlights the item without shifting the layout (no top banner).
 * - Click directly on an item's name/row to take its position (insert before it).
 * - Container items show an [inside] button if moving inside is valid.
 * - The last item in a section shows an [after] button to place at the end.
 */
export function CodebookTreeView({
  items,
  selected,
  onSelect,
  onAddChild,
  onDelete,
  onMoveItem,
  validationIssues = [],
}: CodebookTreeViewProps) {
  const [movingItem, setMovingItem] = useState<string | null>(null);

  const movingNode = movingItem ? findItem(items, movingItem) : null;
  const movingItemName = movingNode?.name || movingItem || "";

  function handleExecuteMove(targetIdentifier: string, position: MoveTargetPosition) {
    if (!movingItem) return;
    onMoveItem(movingItem, targetIdentifier, position);
    setMovingItem(null);
  }

  // Find if an item has validation issues
  function getItemIssue(item: CodebookItem): string | null {
    const issue = validationIssues.find((i) => {
      // Check if path or message references this item's name
      if (item.name && i.message.includes(`'${item.name}'`)) return true;
      return false;
    });
    return issue ? issue.message : null;
  }

  function renderLevel(nodes: (TopLevelItem | InLoopItem)[], depth: number) {
    return nodes.map((item, index) => {
      const itemKey = (item as any)._key || item.name;
      const hasChildren = "children" in item && Array.isArray(item.children);
      const isMoving = movingItem === itemKey || movingItem === item.name;
      const isMoveMode = movingItem !== null;
      const isLastSibling = index === nodes.length - 1;

      const issueMessage = getItemIssue(item);

      // In move mode: can we take this item's place (insert before)?
      const canTakePosition =
        isMoveMode &&
        !isMoving &&
        canMoveItemTo(items, movingItem, itemKey, "before");

      // Can we move inside this container?
      const canInside =
        isMoveMode &&
        !isMoving &&
        (item.type === "unit_loop" || item.type === "condition") &&
        canMoveItemTo(items, movingItem, itemKey, "inside");

      // Can we append after this item (only relevant for the last item in a group)?
      const canAfter =
        isMoveMode &&
        !isMoving &&
        isLastSibling &&
        canMoveItemTo(items, movingItem, itemKey, "after");

      const isTargetable = canTakePosition || canInside || canAfter;

      return (
        <div key={itemKey}>
          <div
            className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all ${
              isMoving
                ? "border border-dashed border-primary bg-primary/10 font-medium text-foreground shadow-xs"
                : selected === itemKey || selected === item.name
                  ? "bg-muted font-medium text-foreground shadow-xs"
                  : isMoveMode
                    ? isTargetable
                      ? "text-foreground hover:bg-muted/80"
                      : "opacity-35 pointer-events-none text-muted-foreground"
                    : "text-muted-foreground hover:bg-muted/70"
            }`}
            style={{ marginLeft: depth * 18 }}
          >
            {/* When in move mode & item can take position: clicking the name takes position */}
            {isMoveMode && !isMoving && canTakePosition ? (
              <button
                type="button"
                title={`Click to place ${movingItemName} before ${item.name}`}
                onClick={() => handleExecuteMove(itemKey, "before")}
                className="flex flex-1 items-center gap-2 text-left cursor-pointer overflow-hidden rounded py-0.5 px-1 hover:bg-primary/15 hover:text-primary transition-colors"
              >
                <ItemIcon type={item.type} />
                <span className="truncate font-medium text-foreground hover:text-primary">
                  {item.name || <em>(unnamed)</em>}
                </span>
                <span className="ml-auto text-[10px] font-semibold text-primary uppercase tracking-wider opacity-80">
                  Take place
                </span>
              </button>
            ) : (
              /* Normal mode click to select */
              <button
                type="button"
                disabled={isMoveMode}
                className={`flex flex-1 items-center gap-2 text-left overflow-hidden ${
                  !isMoveMode ? "cursor-pointer" : ""
                }`}
                onClick={() => {
                  if (!isMoveMode) {
                    onSelect(itemKey);
                  }
                }}
              >
                <ItemIcon type={item.type} />
                <span className="truncate text-foreground font-medium">
                  {item.name || <em className="text-muted-foreground font-normal">(unnamed)</em>}
                </span>
                {item.type === "condition" && (
                  <span className="text-xs text-muted-foreground/80 font-mono truncate">
                    if {item.expression}:
                  </span>
                )}
                {issueMessage && (
                  <span title={issueMessage} className="text-destructive shrink-0">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            )}

            {/* Normal mode action buttons (hover) */}
            {!isMoveMode && (
              <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  title="Move item"
                  onClick={() => setMovingItem(itemKey)}
                  className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Move className="h-3.5 w-3.5" />
                </button>
                {(item.type === "unit_loop" || item.type === "condition") && (
                  <button
                    type="button"
                    title="Add child item"
                    onClick={() => onAddChild(itemKey)}
                    className="p-1 rounded hover:bg-background text-primary hover:text-primary/80 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete item"
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                  onClick={() => onDelete(itemKey)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Currently moving item cancel indicator */}
            {isMoving && (
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  Moving...
                </span>
                <button
                  type="button"
                  title="Cancel move"
                  onClick={() => setMovingItem(null)}
                  className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Move mode: Target action buttons shown only where needed */}
            {isMoveMode && !isMoving && (canInside || canAfter) && (
              <div className="flex items-center gap-1 shrink-0">
                {canInside && (
                  <button
                    type="button"
                    title={`Move inside ${item.name}`}
                    onClick={() => handleExecuteMove(itemKey, "inside")}
                    className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 hover:bg-amber-500 hover:text-white transition-colors cursor-pointer"
                  >
                    [inside]
                  </button>
                )}
                {canAfter && (
                  <button
                    type="button"
                    title={`Move after ${item.name} (end of list)`}
                    onClick={() => handleExecuteMove(itemKey, "after")}
                    className="rounded border border-primary/50 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                  >
                    [after]
                  </button>
                )}
              </div>
            )}
          </div>
          {hasChildren && renderLevel((item as { children: InLoopItem[] }).children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="relative flex flex-col gap-1">
      {renderLevel(items, 0)}

      {/* Sticky footer banner during move mode: does NOT push items down */}
      {movingItem && (
        <div className="sticky bottom-0 mt-3 flex items-center justify-between rounded-lg border border-primary/30 bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur">
          <div className="flex items-center gap-2 truncate">
            <Move className="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
            <span className="truncate text-foreground">
              Moving <strong className="font-semibold text-primary">{movingItemName}</strong> — click an item to take its position
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMovingItem(null)}
            className="ml-2 font-semibold text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
