import { createElement } from "react";
import { AlertCircle, CornerDownLeft } from "lucide-react";
import { cn } from "cn";
import { useCodebookTree } from "./context";
import { ITEM_TYPES, itemIcon } from "./itemTypes";
import { AddItemMenu, type AddOption } from "./AddItemMenu";
import { TreeRow } from "./TreeRow";
import { getItemKey, insertableTypesAt, type TreeNode } from "./utils";
import {
  loopTitle,
  parseSimpleCondition,
  unitLoops,
  type TopLevelItem,
  type UnitLoopItem,
} from "@annotinder/contracts";
import { describeCondition, itemTitle } from "../../../codebook/conditions";
import type { TreePosition } from "../../../codebook/codebookEdit";
import { VARIABLE_TYPE_LABELS } from "../VariableTypeForm";
import { findItem, findParent, loopUnitsSummary } from "../../../codebook/tree";

/** How an item is called in menus: its title, a condition by its condition, a loop by its position. */
export function rowTitle(items: TopLevelItem[], item: TreeNode): string {
  if (item.type === "condition" && !item.label?.trim()) return `if ${describeCondition(item.condition)}`;
  if (item.type === "unit_loop") {
    const key = unitLoops(items).find((l) => l.loop === item)?.key ?? "";
    return loopTitle(item, key);
  }
  return itemTitle(item) || "(unnamed)";
}

/** How a position is called in the add menu. */
export function positionLabel(items: TopLevelItem[], position: TreePosition): string {
  if ("into" in position) {
    if (position.into === null) return "At the end of the codebook";
    const container = findItem(items, position.into);
    return `Inside ${container ? rowTitle(items, container as TreeNode) : "it"}`;
  }
  if ("before" in position) {
    // Before the first item of a container: the top of the container.
    const parent = findParent(items, position.before);
    if (parent && parent.children[0] && getItemKey(parent.children[0]) === position.before) {
      return `At the top of ${rowTitle(items, parent)}`;
    }
  }
  const key = "before" in position ? position.before : position.after;
  const item = findItem(items, key);
  return `${"before" in position ? "Before" : "After"} ${item ? rowTitle(items, item as TreeNode) : "it"}`;
}

/** A position's label as a move: "Move after x", "Move to the top of y", "Move into z". */
function moveLabel(label: string): string {
  const rest = label.replace(/^At the top of/, "to the top of").replace(/^Inside/, "into");
  return `Move ${rest[0].toLowerCase()}${rest.slice(1)}`;
}

/**
 * An item row: a tick box (for moving and deleting several items, shown
 * on hover or while items are ticked), the item (click: open it), and a +
 * to add an item below it (shown on hover): after it, or for a loop or
 * condition at the top of its children. While moving, the + becomes
 * "move below this item", at the same place: rows never shift.
 */
export function TreeItemRow({ item }: { item: TreeNode }) {
  const tree = useCodebookTree();
  const key = getItemKey(item);
  const ticked = tree.isChecked(key);
  const inTicked = ticked && !tree.checked.has(key);
  const positions = tree.readOnly ? [] : tree.addPositions(key);
  // Moving: the places below this row the ticked items may go.
  const options: AddOption[] = (tree.moving ? positions.filter(tree.canMoveTo) : positions).map((position) => ({
    position,
    label: positionLabel(tree.items, position),
    types: insertableTypesAt(tree.items, position),
  }));

  const action = tree.readOnly ? null : tree.moving ? (
    <AddItemMenu
      key="move"
      icon={CornerDownLeft}
      title="Move below this item"
      className="text-primary"
      options={options.map((o) => ({ ...o, label: moveLabel(o.label) }))}
      onAdd={() => undefined}
      onPick={tree.moveTo}
      onPreview={tree.setPreview}
    />
  ) : (
    <AddItemMenu key="add" options={options} onAdd={tree.addAt} onPreview={tree.setPreview} />
  );

  return (
    <TreeRow
      actions={action}
      dimActions={!tree.moving}
      className={cn(
        tree.selected === key ? "" : "font-thin hover:bg-muted/10",
        ticked && "",
        tree.moving && ticked && "ring-1 ring-primary/40",
      )}
    >
      {!tree.readOnly && (
        <input
          type="checkbox"
          aria-label={`Select ${rowTitle(tree.items, item)}`}
          title={inTicked ? "Selected with the item it is in" : "Select to move or delete"}
          checked={ticked}
          disabled={inTicked || tree.moving}
          onChange={() => tree.toggleChecked(key)}
          className={cn(
            "h-3.5 w-3.5 mr-px shrink-0 cursor-pointer accent-primary transition-opacity disabled:cursor-default",
            tree.checked.size === 0 && "opacity-0  group-hover:opacity-60 focus-visible:opacity-100",
          )}
        />
      )}
      <button
        type="button"
        onClick={() => tree.select(key)}
        className={cn("flex min-w-0 pl-1 flex-1 rounded  cursor-pointer items-center gap-1 text-left",

          tree.selected === key ? "bg-muted" : "")}
      >
        <ItemLabel item={item} selected={tree.selected === key} issue={tree.getIssue(item)} changed={tree.isChanged(item)} />
      </button>
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
            "truncate px-1.5 py-0.5 font-medium text-secondary-dark/90",
            parseSimpleCondition(item.condition.script) ? "text-sm" : "font-mono text-xs",
          )}
        >
          if {describeCondition(item.condition)}
        </span>
      ) : (
        <span className={cn("truncate px-1.5 py-0.5", selected ? "font-semibold" : "font-medium")}>
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
