import { createElement, useState } from "react";
import { AlertCircle, ArrowUpToLine, ListEnd, Move, Trash2, X } from "lucide-react";
import { cn } from "cn";
import { useCodebookTree } from "./context";
import { ITEM_TYPES, itemIcon } from "./itemTypes";
import { AddItemMenu } from "./AddItemMenu";
import { ActionButton, TreeRow } from "./TreeRow";
import { getChildren, getItemKey, insertableTypesIn, insertableTypesNextTo, type TreeNode } from "./utils";
import { loopTitle, parseSimpleCondition, unitLoops, type UnitLoopItem } from "@annotinder/contracts";
import { describeCondition, itemTitle } from "../../../codebook/conditions";
import { VARIABLE_TYPE_LABELS } from "../VariableTypeForm";
import { loopUnitsSummary } from "../../../codebook/tree";

interface TreeItemRowProps {
  item: TreeNode;
}

export function TreeItemRow({ item }: TreeItemRowProps) {
  const { movingKey } = useCodebookTree();
  if (movingKey === null) return <EditItemRow item={item} />;
  return <MoveItemRow item={item} />;
}

/** How a container is called in "add to the end of ...": a condition's title is a whole condition. */
function containerName(item: TreeNode): string {
  return item.type === "condition" ? "this condition" : itemTitle(item) || "this container";
}

/**
 * Normal mode: click to select; actions to insert above, move and delete.
 * Loops and conditions also add to the end of their children (the only
 * place a row's "insert above" can't reach).
 */
function EditItemRow({ item }: TreeItemRowProps) {
  const tree = useCodebookTree();
  const key = getItemKey(item);
  const [insertPreview, setInsertPreview] = useState(false);
  const [endActive, setEndActive] = useState(false);
  const isContainer = getChildren(item) !== null;

  const actions = !tree.readOnly && (
    <>
      {isContainer && (
        <AddItemMenu
          icon={ListEnd}
          title={`Add to the end of ${containerName(item)}`}
          allowedTypes={insertableTypesIn(tree.items, item)}
          onAdd={(type) => tree.insertAtEnd(key, type)}
          onActiveChange={(active) => {
            setEndActive(active);
            if (active) tree.setEndPreview(key);
            else if (tree.endPreview === key) tree.setEndPreview(null);
          }}
        />
      )}
      <AddItemMenu
        title={`Insert above ${itemTitle(item) || "item"}`}
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
      dimActions={!insertPreview && !endActive}
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
        <ItemLabel item={item} selected={tree.selected === key} issue={tree.getIssue(item)} changed={tree.isChanged(item)} />
      </button>
    </TreeRow>
  );
}

/**
 * Move mode: the add buttons become move buttons, at the same places: "move
 * above this item" and, on loops and conditions, "move to the end of its
 * children". Clicking anything else cancels the move.
 */
function MoveItemRow({ item }: TreeItemRowProps) {
  const tree = useCodebookTree();
  const key = getItemKey(item);
  const isMovingItem = tree.movingKey === key;
  const canAbove = tree.canMoveBefore(key);
  const canEnd = getChildren(item) !== null && tree.canMoveToEnd(key);
  const [abovePreview, setAbovePreview] = useState(false);

  const actions = isMovingItem ? (
    <MovingBadge onCancel={tree.cancelMove} />
  ) : (
    <>
      {canEnd && (
        <ActionButton
          icon={ListEnd}
          title={`Move to the end of ${containerName(item)}`}
          className="text-primary"
          onMouseEnter={() => tree.setEndPreview(key)}
          onMouseLeave={() => tree.endPreview === key && tree.setEndPreview(null)}
          onClick={(e) => {
            e.stopPropagation();
            tree.setEndPreview(null);
            tree.moveToEnd(key);
          }}
        />
      )}
      {canAbove && (
        <ActionButton
          icon={ArrowUpToLine}
          title={`Move above ${itemTitle(item) || "item"}`}
          className="text-primary"
          onMouseEnter={() => setAbovePreview(true)}
          onMouseLeave={() => setAbovePreview(false)}
          onClick={(e) => {
            e.stopPropagation();
            tree.moveBefore(key);
          }}
        />
      )}
    </>
  );

  return (
    <TreeRow
      showInsertionLine={abovePreview}
      actions={actions}
      className={cn(
        isMovingItem && "bg-primary/10 ring-1 ring-primary/40",
        !isMovingItem && !canAbove && !canEnd && "select-none opacity-40",
      )}
    >
      <ItemLabel item={item} issue={tree.getIssue(item)} />
    </TreeRow>
  );
}

function ItemLabel({
  item,
  selected = false,
  issue,
  changed = false,
}: {
  item: TreeNode;
  selected?: boolean;
  issue: string | null;
  changed?: boolean;
}) {
  return (
    <>
      <ItemIcon item={item} />
      {item.type === "condition" && !item.label?.trim() ? (
        // Conditions have no name: shown by their condition, unless they have a label.
        <span
          className={cn(
            "truncate px-1.5 py-0.5 font-medium text-foreground",
            parseSimpleCondition(item.condition.script) ? "text-sm" : "font-mono text-xs",
          )}
        >
          if {describeCondition(item.condition)}
        </span>
      ) : (
        <span className={cn("truncate px-1.5 py-0.5 text-foreground", selected ? "font-semibold" : "font-medium")}>
          {item.type === "unit_loop" ? <LoopTitle loop={item} /> : itemTitle(item) || <em className="font-normal text-muted-foreground">(unnamed)</em>}
        </span>
      )}
      {item.type === "unit_loop" && (
        <span className="truncate text-xs text-muted-foreground">{loopUnitsSummary(item)}</span>
      )}
      {changed && (
        <span title="Unsaved changes" aria-label="Unsaved changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
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

function ItemIcon({ item }: { item: TreeNode }) {
  const title = "variable" in item && item.variable ? VARIABLE_TYPE_LABELS[item.variable.type] : ITEM_TYPES[item.type].label;
  return (
    <span title={title} className="shrink-0">
      {createElement(itemIcon(item), { className: `h-4 w-4 ${ITEM_TYPES[item.type].color}` })}
    </span>
  );
}

/** A loop's label, or "Unit loop <n>" by its position (contracts `loopTitle`). */
function LoopTitle({ loop }: { loop: UnitLoopItem }) {
  const { items } = useCodebookTree();
  const key = unitLoops(items).find((l) => l.loop === loop)?.key ?? "";
  return <>{loopTitle(loop, key)}</>;
}
