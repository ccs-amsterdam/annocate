import { useState, type MouseEvent } from "react";
import { AlertCircle, Move, Trash2, X } from "lucide-react";
import { cn } from "cn";
import { useCodebookTree } from "./context";
import { ITEM_TYPES } from "./itemTypes";
import { AddItemMenu } from "./AddItemMenu";
import { ActionButton, TreeRow } from "./TreeRow";
import { getItemKey, insertableTypesNextTo, type ItemType, type TreeNode } from "./utils";

interface TreeItemRowProps {
  item: TreeNode;
}

export function TreeItemRow({ item }: TreeItemRowProps) {
  const { movingKey } = useCodebookTree();
  if (movingKey === null) return <EditItemRow item={item} />;
  return <MoveItemRow item={item} />;
}

/** Normal mode: click to select; actions to insert above, move and delete. */
function EditItemRow({ item }: TreeItemRowProps) {
  const tree = useCodebookTree();
  const key = getItemKey(item);
  const [insertPreview, setInsertPreview] = useState(false);

  const actions = (
    <>
      <AddItemMenu
        title={`Insert above ${item.name || "item"}`}
        allowedTypes={insertableTypesNextTo(tree.items, item)}
        onAdd={(type) => tree.insertBefore(key, type)}
        onActiveChange={setInsertPreview}
      />
      <ActionButton icon={Move} title="Move item" onClick={() => tree.startMove(key)} />
      <ActionButton icon={Trash2} title="Delete item" destructive onClick={() => tree.remove(key)} />
    </>
  );

  return (
    <TreeRow

      actions={actions}
      dimActions={!insertPreview}
      showInsertionLine={insertPreview}
      className={cn(
        "",
        tree.selected === key ? "font-bold hover:text-foreground" : "font-thin hover:bg-muted/10",
      )}
    >
      <button
        type="button"
        onClick={() => tree.select(key)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
      >
        <ItemLabel item={item} selected={tree.selected === key} issue={tree.getIssue(item)} />
      </button>
    </TreeRow>
  );
}

/**
 * Move mode: clicking a valid row moves the item to that row's position
 * (i.e. directly above it). Clicking anything else cancels the move.
 */
function MoveItemRow({ item }: TreeItemRowProps) {
  const tree = useCodebookTree();
  const key = getItemKey(item);
  const isMovingItem = tree.movingKey === key;
  const isValidTarget = tree.canMoveBefore(key);
  const [hovered, setHovered] = useState(false);

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    if (isValidTarget) tree.moveBefore(key);
    else tree.cancelMove();
  }

  return (
    <TreeRow

      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      showInsertionLine={isValidTarget && hovered}
      actions={isMovingItem && <MovingBadge onCancel={tree.cancelMove} />}
      className={cn(
        "cursor-pointer",
        isMovingItem && "bg-primary/10 ring-1 ring-primary/40",
        isValidTarget && "text-foreground hover:bg-muted/40",
        !isValidTarget && !isMovingItem && "select-none opacity-30",
      )}
    >
      <ItemLabel item={item} issue={tree.getIssue(item)} />
    </TreeRow>
  );
}

function ItemLabel({ item, selected = false, issue }: { item: TreeNode; selected?: boolean; issue: string | null }) {
  return (
    <>
      <ItemIcon type={item.type} />
      <span
        className={cn("truncate px-1.5 py-0.5 text-foreground", selected ? "font-semibold" : "font-medium")}
      >
        {item.name || <em className="font-normal text-muted-foreground">(unnamed)</em>}
      </span>
      {item.type === "condition" && (
        <span className="truncate font-mono text-xs text-muted-foreground/80">if {item.expression}:</span>
      )}
      {issue && (
        <span title={issue} className="shrink-0 text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );
}

function MovingBadge({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <span className="rounded bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">Moving...</span>
      <ActionButton
        icon={X}
        title="Cancel move"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
      />
    </>
  );
}

function ItemIcon({ type }: { type: ItemType }) {
  const { icon: Icon, color } = ITEM_TYPES[type];
  return <Icon className={`h-4 w-4 shrink-0 ${color}`} />;
}
